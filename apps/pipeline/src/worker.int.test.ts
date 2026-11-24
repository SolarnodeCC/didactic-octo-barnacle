import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeBucket } from "./test/fake-bucket.js";
import { FakeQueue } from "./test/fake-queue.js";
import { makeWork } from "./test/harness.js";
import { createTestDatabase, type TestDatabase } from "./test/sqlite-d1.js";
import worker, { CandidateWorkflow, type Env } from "./worker.js";
import { candidateRunEnvelope } from "./queue/deps.js";

// The Worker entry wires the real collectors, guard, alert sink, and queue consumer
// to its bindings. These tests drive it as the runtime does: through the default
// export, with in-memory bindings and a stubbed global fetch (REQ-TEST-003).

const OPENALEX_CRON = "0 6 * * *";
// A dummy value; it only proves the binding reaches the request header.
const OPENALEX_TEST_KEY = "test-openalex-key";
const ERASURE_TEST_KEY = "test-erasure-key-of-at-least-32-characters";

let database: TestDatabase;
let queue: FakeQueue;
let documentQueue: FakeQueue;
let logs: string[];

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "test",
    DB: database.Db,
    DOCUMENTS: new FakeBucket(),
    PUBLICATION_QUEUE: queue,
    DOCUMENT_QUEUE: documentQueue,
    OPENALEX_API_KEY: OPENALEX_TEST_KEY,
    ERASURE_HASH_KEY: ERASURE_TEST_KEY,
    ...overrides,
  };
}

function count(table: string): number {
  return (database.Raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function drainThroughWorker(env: Env): Promise<number> {
  return queue.drain({ MaxRetries: 1, Consume: (batch) => worker.queue(batch, env) });
}

function stubOpenAlex(works: unknown[]): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://api.openalex.org/works")) {
      return Promise.resolve(Response.json({ results: works, meta: { next_cursor: null } }));
    }
    return Promise.reject(new Error(`REQ-TEST-003: unexpected fetch ${url}`));
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

beforeEach(() => {
  database = createTestDatabase();
  queue = new FakeQueue();
  documentQueue = new FakeQueue();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("REQ-NFR-002: collector Worker entry", () => {
  it("REQ-NFR-002: the fetch handler answers a health check with the service and environment", async () => {
    const response = await worker.fetch(new Request("https://pipeline.invalid/"), makeEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "roi-pipeline", environment: "test" });
  });

  it("REQ-DATA-009: an unknown cron expression starts no run and is logged", async () => {
    await worker.scheduled({ cron: "15 3 * * *" }, makeEnv());

    expect(count("ingestion_run")).toBe(0);
    expect(queue.sent).toHaveLength(0);
    expect(logs.some((line) => line.includes("cron.unknown"))).toBe(true);
  });

  it("REQ-DATA-001: the OpenAlex cron fetches with the API key and the queue handler stores the works", async () => {
    const fetchStub = stubOpenAlex([makeWork(1), makeWork(2)]);
    const env = makeEnv();

    await worker.scheduled({ cron: OPENALEX_CRON }, env);
    await drainThroughWorker(env);

    expect(count("publication")).toBe(2);
    const run = database.Raw.prepare("SELECT status FROM ingestion_run").get() as {
      status: string;
    };
    expect(run.status).toBe("succeeded");
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.openalex\.org\/works\?/);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${OPENALEX_TEST_KEY}`,
    );
  });

  it("REQ-NFR-016: without the erasure key the page is dead-lettered, the run fails, and nothing is stored", async () => {
    stubOpenAlex([makeWork(1)]);
    const env = makeEnv({ ERASURE_HASH_KEY: undefined });

    await worker.scheduled({ cron: OPENALEX_CRON }, env);
    await drainThroughWorker(env);

    expect(count("publication")).toBe(0);
    expect(queue.deadLettered).toHaveLength(1);
    const run = database.Raw.prepare("SELECT status FROM ingestion_run").get() as {
      status: string;
    };
    expect(run.status).toBe("failed");
    expect(logs.some((line) => line.includes("ERASURE_HASH_KEY must be set"))).toBe(true);
  });
});

describe("REQ-PROC-007: the candidate Workflow in the Worker", () => {
  function seedCandidate(): void {
    const now = "2026-11-23T10:00:00.000Z";
    database.Raw.prepare(
      `INSERT INTO publication (id, title, completeness, created_at, updated_at)
       VALUES ('pub_w', 'Title', 'complete', ?, ?)`,
    ).run(now, now);
    database.Raw.prepare(
      `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
         confidence, candidate_count, created_at)
       VALUES ('ext_w', 'pub_w', 'prun_w', 'm', 'extraction@4', 'abstract', 0.7, 1, ?)`,
    ).run(now);
    database.Raw.prepare(
      `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
         customer, customer_quote, created_at)
       VALUES ('cand_w', 'pub_w', 'ext_w', 'A finding.', 'A quote.', 'knowledge workers',
         'knowledge workers', ?)`,
    ).run(now);
  }

  it("REQ-PROC-007: AC1 a candidate.run message starts one instance of CANDIDATE_WORKFLOW", async () => {
    seedCandidate();
    const created: Array<{ id: string; params: { PipelineRunId: string } }> = [];
    const env = makeEnv({
      CANDIDATE_WORKFLOW: {
        create: (options) => {
          created.push(options);
          return Promise.resolve({ id: options.id });
        },
      },
    });
    let acked = false;
    await worker.queue(
      {
        queue: "roi-models-test",
        messages: [
          {
            id: "m1",
            body: candidateRunEnvelope("cand_w"),
            attempts: 1,
            ack: () => {
              acked = true;
            },
            retry: () => undefined,
          },
        ],
      },
      env,
    );
    expect(acked).toBe(true);
    expect(created).toEqual([{ id: "pr_cand_w", params: { PipelineRunId: "pr_cand_w" } }]);
    expect(count("opportunity")).toBe(1);
  });

  it("REQ-PROC-007: AC1 the CandidateWorkflow class runs the stub pipeline with its step runner", async () => {
    seedCandidate();
    database.Raw.prepare(
      `INSERT INTO pipeline_run (id, candidate_id, status, started_at)
       VALUES ('pr_cand_w', 'cand_w', 'running', '2026-11-23T10:00:00.000Z')`,
    ).run();
    database.Raw.prepare(
      `INSERT INTO opportunity (id, candidate_id, pipeline_status, created_at, updated_at)
       VALUES ('opp_w', 'cand_w', 'incomplete', '2026-11-23T10:00:00.000Z', '2026-11-23T10:00:00.000Z')`,
    ).run();
    const steps: string[] = [];
    const workflow = new CandidateWorkflow({}, makeEnv());
    const outcome = await workflow.run(
      { payload: { PipelineRunId: "pr_cand_w" } },
      {
        do(name, callback) {
          steps.push(name);
          return callback();
        },
      },
    );
    expect(outcome).toMatchObject({ PipelineRunId: "pr_cand_w", Status: "complete" });
    expect(steps).toHaveLength(7);
    expect(count("score")).toBe(1);
  });
});
