import { FakeWorkersAi, type ProcessingReport } from "@roi/models";
import { handleApiRequest } from "@roi/api";

import { SLICE_EXTRACTION_OUTPUT, SLICE_TRIAGE_OUTPUT, sliceWork } from "./fixture.js";
import { runCandidatePipeline, type StepRunner } from "../candidate/pipeline.js";
import { STUB_STEPS } from "../candidate/steps.js";
import { ADMISSION_CRON, DEFAULT_INGEST_CONFIG } from "../config.js";
import { FakeBucket } from "../local/fake-bucket.js";
import { FakeQueue } from "../local/fake-queue.js";
import { createTestDatabase, counter, type TestDatabase } from "../local/sqlite-d1.js";
import { PRICE_TABLE } from "../prices.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { consumeBatch } from "../queue/consume.js";
import { candidateRunEnvelope, type PipelineDeps } from "../queue/deps.js";
import { addRunCountStatements } from "../recovery/redrive-repo.js";
import { reportProcessingRuns, storedProcessingReport } from "../report/processing-report.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { startRun } from "../schedule/start-run.js";
import { createModelUsageStore } from "../store/model-usage.js";

export type SliceOptions = {
  /** A new SQLite file to keep the slice's data; in memory when left out. */
  DatabasePath?: string;
  /** When the slice ingests; the admission runs the next day at 11:00 UTC. */
  Start?: string;
  Log?: (event: string, fields: Record<string, unknown>) => void;
};

export type SliceResult = {
  RunId: string;
  PublicationId: string;
  OpportunityId: string;
  /** The `slice` processing run's report (REQ-PROC-007 AC2, REQ-NFR-008 AC2). */
  Report: ProcessingReport;
  /** The read route's answer for the opportunity (ADR 0058). */
  Response: { Status: number; Body: unknown };
  Database: TestDatabase;
};

const DEFAULT_START = "2026-11-24T06:00:00.000Z";

function nextDayAt(iso: string, time: string): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T${time}`;
}

/**
 * The thin slice, in one process (REQ-PROC-007, ADR 0117): it ingests the example publication
 * from a recorded OpenAlex page, triages and extracts it with recorded model answers through
 * the real consumers, runs the candidate Workflow's steps inline with the stub agents and the
 * placeholder score model, writes the `slice` run report, and asks the read route for the
 * opportunity. Queues are drained in memory; nothing leaves the process.
 */
export async function runSlice(options: SliceOptions = {}): Promise<SliceResult> {
  const database = createTestDatabase(options.DatabasePath ?? ":memory:");
  const db = database.Db;
  const queue = new FakeQueue();
  const clock = { Now: options.Start ?? DEFAULT_START };
  const ids = counter("slc");
  const callDeps = (answer: unknown, prefix: string) => ({
    Ai: new FakeWorkersAi([{ Kind: "output", Output: answer }]),
    GatewayId: "roi-local",
    Usage: createModelUsageStore(db, { Amount: 1.0, Currency: "EUR" }),
    Prices: PRICE_TABLE,
    MaxAttempts: DEFAULT_PROCESSING_CONFIG.ModelMaxAttempts,
    NewId: counter(prefix),
    Now: () => new Date(clock.Now),
    Sleep: () => Promise.resolve(),
  });

  const deps: PipelineDeps = {
    Db: db,
    Queue: queue,
    Now: () => clock.Now,
    NewId: ids,
    Config: DEFAULT_INGEST_CONFIG,
    Documents: new FakeBucket(),
    FetchPdf: () => Promise.reject(new Error("the slice fetches no PDF")),
    Triage: {
      Queue: queue,
      Call: callDeps(SLICE_TRIAGE_OUTPUT, "mct"),
      Model: DEFAULT_PROCESSING_CONFIG.TriageModel,
      AcceptScoreCut: DEFAULT_PROCESSING_CONFIG.AcceptScoreCut,
      Admission: {
        DailyLimit: DEFAULT_PROCESSING_CONFIG.DailyExtractionLimit,
        PoolDays: DEFAULT_PROCESSING_CONFIG.AdmissionPoolDays,
        FullTextWaitHours: DEFAULT_PROCESSING_CONFIG.FullTextWaitHours,
      },
    },
    Extraction: {
      Queue: queue,
      Call: callDeps(SLICE_EXTRACTION_OUTPUT, "mce"),
      Model: DEFAULT_PROCESSING_CONFIG.ExtractionModel,
      MaxCandidates: DEFAULT_PROCESSING_CONFIG.MaxCandidates,
      FullTextMaxChars: DEFAULT_PROCESSING_CONFIG.FullTextMaxChars,
      GenericCustomerTerms: DEFAULT_PROCESSING_CONFIG.GenericCustomerTerms,
    },
    Candidate: {
      Steps: STUB_STEPS,
      // The Workflow's steps run inline, each once, in the order the pipeline asks for them.
      Workflow: {
        async create(instance) {
          const step: StepRunner = { do: (_name, callback) => callback() };
          await runCandidatePipeline({ ...deps, Steps: STUB_STEPS }, step, instance.params);
          return { id: instance.id };
        },
      },
    },
    Recovery: {
      MaxRedrives: DEFAULT_PROCESSING_CONFIG.MaxRedrives,
      MaxRedrivesPerDay: DEFAULT_PROCESSING_CONFIG.MaxRedrivesPerDay,
      DeadLetterReplayHours: DEFAULT_PROCESSING_CONFIG.DeadLetterReplayHours,
      BreakerFailureShare: DEFAULT_PROCESSING_CONFIG.BreakerFailureShare,
      BreakerMinCalls: DEFAULT_PROCESSING_CONFIG.BreakerMinCalls,
    },
    Sources: {
      FetchOpenAlexPage: () =>
        Promise.resolve({ Works: [sliceWork(clock.Now.slice(0, 10))], NextCursor: null }),
      FetchArxivPage: () => Promise.resolve({ Entries: [], OutOfScope: 0, Returned: 0 }),
      FetchArxivByIds: () => Promise.resolve([]),
    },
    ...(options.Log ? { Log: options.Log } : {}),
  };
  const drain = () => queue.drain({ MaxRetries: 3, Consume: (batch) => consumeBatch(deps, batch) });

  const runId = `slice_${clock.Now.replace(/\D/gu, "").slice(0, 14)}`;
  await db
    .prepare(
      "INSERT INTO processing_run (id, kind, day, status, started_at) VALUES (?, 'slice', ?, 'running', ?)",
    )
    .bind(runId, clock.Now.slice(0, 10), clock.Now)
    .run();

  // 1. Ingest the recorded page; triage runs on the model queue (REQ-PROC-007 AC1).
  await startRun(deps, "openalex");
  await drain();
  // 2. The next day's admission run admits the publication and queues its extraction.
  clock.Now = nextDayAt(clock.Now, "11:00:00.000Z");
  await runScheduled(deps, ADMISSION_CRON);
  await drain();
  // 3. Every candidate of the slice publication runs through the candidate Workflow.
  const publication = await db
    .prepare("SELECT id FROM publication ORDER BY created_at LIMIT 1")
    .first<{ id: string }>();
  if (publication === null) {
    throw new Error("the slice ingested no publication");
  }
  const { results: candidates } = await db
    .prepare("SELECT id FROM candidate WHERE publication_id = ? ORDER BY id")
    .bind(publication.id)
    .all<{ id: string }>();
  for (const candidate of candidates) {
    await queue.send(candidateRunEnvelope(candidate.id, runId));
  }
  await drain();

  // 4. The slice run's counts and report (REQ-PROC-007 AC2).
  const count = async (sql: string) =>
    (await db.prepare(sql).bind(publication.id).first<{ n: number }>())?.n ?? 0;
  const counts = {
    Ingested: 1,
    Triaged: await count("SELECT COUNT(*) AS n FROM triage_decision WHERE publication_id = ?"),
    Extracted: await count("SELECT COUNT(*) AS n FROM extraction_result WHERE publication_id = ?"),
    Candidates: candidates.length,
    Opportunities: await count(
      "SELECT COUNT(*) AS n FROM opportunity o JOIN candidate c ON c.id = o.candidate_id WHERE c.publication_id = ?",
    ),
    Scored: await count(
      "SELECT COUNT(*) AS n FROM opportunity o JOIN candidate c ON c.id = o.candidate_id WHERE c.publication_id = ? AND o.pipeline_status = 'complete'",
    ),
  };
  await db.batch([
    ...addRunCountStatements(db, runId, counts),
    db
      .prepare("UPDATE processing_run SET status = 'succeeded', ended_at = ? WHERE id = ?")
      .bind(clock.Now, runId),
  ]);
  await reportProcessingRuns(deps, clock.Now.slice(0, 10));
  const report = await storedProcessingReport(db, runId);
  if (report === null) {
    throw new Error("the slice run has no report");
  }

  // 5. The data API returns the opportunity (ADR 0058).
  const opportunity = await db
    .prepare(
      "SELECT o.id FROM opportunity o JOIN candidate c ON c.id = o.candidate_id WHERE c.publication_id = ? ORDER BY o.id LIMIT 1",
    )
    .bind(publication.id)
    .first<{ id: string }>();
  if (opportunity === null) {
    throw new Error("the slice made no opportunity");
  }
  const response = await handleApiRequest(
    db,
    new Request(`http://localhost/api/v1/opportunities/${opportunity.id}`),
  );
  return {
    RunId: runId,
    PublicationId: publication.id,
    OpportunityId: opportunity.id,
    Report: report,
    Response: { Status: response.status, Body: (await response.json()) as unknown },
    Database: database,
  };
}
