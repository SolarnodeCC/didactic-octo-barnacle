import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeBucket } from "./test/fake-bucket.js";
import { FakeQueue } from "./test/fake-queue.js";
import { makeWork } from "./test/harness.js";
import { createTestDatabase, type TestDatabase } from "./test/sqlite-d1.js";
import worker, { type Env } from "./worker.js";

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
