import { FakeVectorize } from "@roi/vector-store";
import { REFERENCE_EMBEDDING } from "@roi/vector-store";

import { LOAD_SENTENCES, loadEntry, loadWork, splitCorpus } from "./corpus.js";
import { TimedQueue, WRANGLER_QUEUES, type QueueStats } from "./timed-queues.js";
import { TimedWorkersAi, type ModelProfile, type ModelStats } from "./timed-workers-ai.js";
import { VirtualClock } from "./virtual-clock.js";
import { ADMISSION_CRON, DEFAULT_INGEST_CONFIG, RECOVERY_CRON } from "../config.js";
import { FakeBucket } from "../local/fake-bucket.js";
import { createTestDatabase, counter } from "../local/sqlite-d1.js";
import { PRICE_TABLE } from "../prices.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { consumeBatch } from "../queue/consume.js";
import { type PipelineDeps } from "../queue/deps.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { startRun } from "../schedule/start-run.js";
import { SLICE_EXTRACTION_OUTPUT } from "../slice/fixture.js";
import { createModelUsageStore } from "../store/model-usage.js";

/**
 * Latency and request limits per model (ADR 0118). Triage and extraction use the benchmark
 * latencies (rounds two and three) and the Workers AI limits: 300 requests a minute by default,
 * 20 for a paid model. Embedding latency was not benchmarked; it is an assumption.
 */
export const LOAD_PROFILES: Record<string, ModelProfile> = {
  [DEFAULT_PROCESSING_CONFIG.TriageModel.Model]: {
    P50Seconds: 3.0,
    P95Seconds: 5.9,
    RequestsPerMinute: 300,
  },
  [DEFAULT_PROCESSING_CONFIG.ExtractionModel.Model]: {
    P50Seconds: 11.7,
    P95Seconds: 31.9,
    RequestsPerMinute: 20,
  },
  [REFERENCE_EMBEDDING.Model]: { P50Seconds: 0.5, P95Seconds: 1.5, RequestsPerMinute: 300 },
};

/** Default size: the largest measured day, 4,634 publications. */
export const LARGEST_MEASURED_DAY = 4634;

export type LoadOptions = {
  Publications?: number;
  Seed?: number;
  /** The day the load runs; ingestion starts at 06:00 UTC. */
  Day?: string;
  /**
   * `model.extraction_requests_per_minute` for the run; null sends extraction unpaced, as before
   * ADR 0118, to show what the pacing prevents.
   */
  ExtractionRequestsPerMinute?: number | null;
};

/**
 * Time a source takes to answer one page (ADR 0118): about 2 s for OpenAlex, and the 3 s
 * request interval that arXiv asks for.
 */
export const SOURCE_PAGE_SECONDS = { OpenAlex: 2, Arxiv: 3 } as const;

export type LoadReport = {
  Publications: number;
  Day: string;
  Counts: {
    Ingested: number;
    Triaged: number;
    /** Publications that passed triage: admitted or waiting for admission. */
    PassedTriage: number;
    Admitted: number;
    Extracted: number;
    Embedded: number;
    RedriveRows: number;
  };
  /** Hours after 06:00 UTC on the day at which each stage finished; null when nothing ran. */
  FinishedAfterHours: {
    Ingestion: number | null;
    Triage: number | null;
    Embedding: number | null;
    Extraction: number | null;
  };
  Queues: QueueStats[];
  Models: Array<{ Model: string } & ModelStats>;
  ConsumerErrors: number;
  Verdicts: {
    /** AC1, strict reading: every publication triaged before the 11:00 admission run. */
    TriageBeforeAdmission: boolean;
    /** AC1, plain reading: ingestion and triage done before the next day's 06:00 run. */
    TriageBeforeNextIngestion: boolean;
    /** AC2: the admitted daily limit extracted within 24 hours of the day's start. */
    ExtractionWithin24Hours: boolean;
    /** No message was dead-lettered and no model concurrency exceeded the queue's limit. */
    NothingLost: boolean;
  };
  Passed: boolean;
};

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return value >>> 0;
}

/** About 60 % of publications pass triage: three true signals, or one. */
function triageAnswer(inputs: Record<string, unknown>): unknown {
  const messages = (inputs.messages ?? []) as Array<{ content: string }>;
  const accept = hash(messages.map((message) => message.content).join("\n")) % 10 < 6;
  return {
    Signals: {
      NamedParty: true,
      StatedHarm: accept,
      Trigger: false,
      ExistingAlternative: accept,
      Adoptable: false,
    },
    Notes: null,
  };
}

const HOUR = 3_600_000;

/**
 * The REQ-NFR-010 load test (ADR 0118): a generated day of publications through the real
 * ingestion, triage, embedding, admission, and extraction consumers, on queues with the batch
 * sizes and concurrency of wrangler.toml and models with benchmark latencies and request limits,
 * all on a virtual clock. The day's crons run at their times: OpenAlex 06:00, arXiv 07:30,
 * admission 11:00, and the recovery check every 30 minutes, until 06:00 the next day.
 */
export async function runLoad(options: LoadOptions = {}): Promise<LoadReport> {
  const total = options.Publications ?? LARGEST_MEASURED_DAY;
  const day = options.Day ?? "2026-11-24";
  const start = `${day}T06:00:00.000Z`;
  const nextDay = new Date(Date.parse(start) + 24 * HOUR).toISOString();
  const split = splitCorpus(total);
  const publishedOn = new Date(Date.parse(start) - 24 * HOUR).toISOString().slice(0, 10);
  const works = Array.from({ length: split.OpenAlex }, (_, i) => loadWork(i + 1, publishedOn));
  const entries = Array.from({ length: split.Arxiv }, (_, i) =>
    loadEntry(i + 1, `${publishedOn}T12:00:00Z`),
  );

  const clock = new VirtualClock(start);
  const database = createTestDatabase();
  const db = database.Db;
  const errors: unknown[] = [];
  const onError = (error: unknown) => errors.push(error);
  const ai = new TimedWorkersAi(
    clock,
    LOAD_PROFILES,
    {
      [DEFAULT_PROCESSING_CONFIG.TriageModel.Model]: triageAnswer,
      [DEFAULT_PROCESSING_CONFIG.ExtractionModel.Model]: () => SLICE_EXTRACTION_OUTPUT,
    },
    options.Seed ?? 1,
  );
  const call = {
    Ai: ai,
    GatewayId: "roi-load",
    Usage: createModelUsageStore(db, { Amount: 1.25, Currency: "EUR" }),
    Prices: PRICE_TABLE,
    MaxAttempts: DEFAULT_PROCESSING_CONFIG.ModelMaxAttempts,
    NewId: counter("mc"),
    Now: () => new Date(clock.now()),
    Sleep: (ms: number) => clock.sleep(ms),
  };

  // The queues call the consumer through `deps`, which is defined below; a batch is consumed only
  // once the clock runs, after `deps` exists.
  const consume = (batch: Parameters<typeof consumeBatch>[1]) => consumeBatch(deps, batch);
  const queues = {
    publications: new TimedQueue(WRANGLER_QUEUES.publications, clock, consume, onError),
    documents: new TimedQueue(WRANGLER_QUEUES.documents, clock, consume, onError),
    models: new TimedQueue(WRANGLER_QUEUES.models, clock, consume, onError),
    embeddings: new TimedQueue(WRANGLER_QUEUES.embeddings, clock, consume, onError),
  };
  const pageSize = DEFAULT_INGEST_CONFIG.PageSize;
  const deps: PipelineDeps = {
    Db: db,
    Queue: queues.publications,
    DocumentQueue: queues.documents,
    Now: () => clock.now(),
    NewId: counter("ld"),
    Config: DEFAULT_INGEST_CONFIG,
    Documents: new FakeBucket(),
    FetchPdf: () => Promise.reject(new Error("the load corpus has no PDF")),
    Triage: {
      Queue: queues.models,
      Call: call,
      Model: DEFAULT_PROCESSING_CONFIG.TriageModel,
      AcceptScoreCut: DEFAULT_PROCESSING_CONFIG.AcceptScoreCut,
      Admission: {
        DailyLimit: DEFAULT_PROCESSING_CONFIG.DailyExtractionLimit,
        PoolDays: DEFAULT_PROCESSING_CONFIG.AdmissionPoolDays,
        FullTextWaitHours: DEFAULT_PROCESSING_CONFIG.FullTextWaitHours,
      },
    },
    Extraction: {
      Queue: queues.models,
      Call: call,
      Model: DEFAULT_PROCESSING_CONFIG.ExtractionModel,
      MaxCandidates: DEFAULT_PROCESSING_CONFIG.MaxCandidates,
      FullTextMaxChars: DEFAULT_PROCESSING_CONFIG.FullTextMaxChars,
      GenericCustomerTerms: DEFAULT_PROCESSING_CONFIG.GenericCustomerTerms,
      ...(options.ExtractionRequestsPerMinute === null
        ? {}
        : {
            RequestsPerMinute:
              options.ExtractionRequestsPerMinute ??
              DEFAULT_PROCESSING_CONFIG.ExtractionRequestsPerMinute,
          }),
    },
    Embedding: {
      Queue: queues.embeddings,
      Call: call,
      Environment: "load",
      Indexes: { PUBLICATION_VECTORS: new FakeVectorize() },
    },
    Recovery: {
      MaxRedrives: DEFAULT_PROCESSING_CONFIG.MaxRedrives,
      MaxRedrivesPerDay: DEFAULT_PROCESSING_CONFIG.MaxRedrivesPerDay,
      DeadLetterReplayHours: DEFAULT_PROCESSING_CONFIG.DeadLetterReplayHours,
      BreakerFailureShare: DEFAULT_PROCESSING_CONFIG.BreakerFailureShare,
      BreakerMinCalls: DEFAULT_PROCESSING_CONFIG.BreakerMinCalls,
    },
    Sources: {
      FetchOpenAlexPage: async (request) => {
        await clock.sleep(SOURCE_PAGE_SECONDS.OpenAlex * 1000);
        const page = Number(request.Cursor ?? "0");
        const slice = works.slice(page * pageSize, (page + 1) * pageSize);
        const more = (page + 1) * pageSize < works.length;
        return { Works: slice, NextCursor: more ? String(page + 1) : null };
      },
      FetchArxivPage: async (request) => {
        await clock.sleep(SOURCE_PAGE_SECONDS.Arxiv * 1000);
        const slice = entries.slice(request.Start, request.Start + request.MaxResults);
        return { Entries: slice, OutOfScope: 0, Returned: slice.length };
      },
      FetchArxivByIds: () => Promise.resolve([]),
    },
  };
  const ready = deps;

  // The day's crons at their times (config.ts, wrangler.toml).
  clock.at(start, () => startRun(ready, "openalex"), onError);
  clock.at(`${day}T07:30:00.000Z`, () => startRun(ready, "arxiv"), onError);
  clock.at(`${day}T11:00:00.000Z`, () => runScheduled(ready, ADMISSION_CRON), onError);
  for (let at = Date.parse(start) + HOUR / 2; at < Date.parse(nextDay); at += HOUR / 2) {
    clock.at(new Date(at).toISOString(), () => runScheduled(ready, RECOVERY_CRON), onError);
  }
  await clock.run(nextDay);

  const one = async (sql: string) =>
    (await db.prepare(sql).first<{ n: number | string | null }>())?.n ?? null;
  const hoursAfterStart = (iso: number | string | null) =>
    typeof iso === "string"
      ? Math.round(((Date.parse(iso) - Date.parse(start)) / HOUR) * 100) / 100
      : null;
  const counts = {
    Ingested: Number(await one("SELECT COUNT(*) AS n FROM publication")),
    Triaged: Number(await one("SELECT COUNT(*) AS n FROM triage_decision")),
    PassedTriage: Number(
      await one(
        "SELECT COUNT(*) AS n FROM triage_decision WHERE accepted = 1 OR status = 'awaiting-admission'",
      ),
    ),
    Admitted: Number(
      await one("SELECT COUNT(*) AS n FROM triage_decision WHERE admitted_on IS NOT NULL"),
    ),
    Extracted: Number(await one("SELECT COUNT(*) AS n FROM extraction_result")),
    Embedded: Number(await one("SELECT COUNT(*) AS n FROM embedding")),
    RedriveRows: Number(await one("SELECT COUNT(*) AS n FROM redrive")),
  };
  const finished = {
    Ingestion: hoursAfterStart(await one("SELECT MAX(ended_at) AS n FROM ingestion_run")),
    Triage: hoursAfterStart(await one("SELECT MAX(created_at) AS n FROM triage_decision")),
    Embedding: hoursAfterStart(await one("SELECT MAX(created_at) AS n FROM embedding")),
    Extraction: hoursAfterStart(await one("SELECT MAX(created_at) AS n FROM extraction_result")),
  };
  const queueStats = Object.values(queues).map((queue) => queue.Stats);
  const modelStats = [...ai.Stats.entries()].map(([model, stats]) => ({ Model: model, ...stats }));
  const allTriaged = counts.Triaged === counts.Ingested && counts.Ingested === total;
  const expectedExtractions = Math.min(
    counts.PassedTriage,
    DEFAULT_PROCESSING_CONFIG.DailyExtractionLimit,
  );
  const verdicts = {
    TriageBeforeAdmission: allTriaged && finished.Triage !== null && finished.Triage <= 5,
    TriageBeforeNextIngestion:
      allTriaged && finished.Ingestion !== null && finished.Triage !== null && finished.Triage < 24,
    ExtractionWithin24Hours:
      counts.Extracted === expectedExtractions &&
      (expectedExtractions === 0 || (finished.Extraction !== null && finished.Extraction <= 24)),
    NothingLost:
      queueStats.every((queue) => queue.DeadLettered === 0) &&
      queues.models.Stats.PeakConcurrency <= WRANGLER_QUEUES.models.Concurrency &&
      errors.length === 0,
  };
  database.Raw.close();
  return {
    Publications: total,
    Day: day,
    Counts: counts,
    FinishedAfterHours: finished,
    Queues: queueStats,
    Models: modelStats,
    ConsumerErrors: errors.length,
    Verdicts: verdicts,
    Passed: Object.values(verdicts).every(Boolean),
  };
}

export { LOAD_SENTENCES };
