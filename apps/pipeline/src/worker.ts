import { WorkflowEntrypoint } from "cloudflare:workers";

import { type CallModelDeps } from "@roi/models";
import { type VectorIndex } from "@roi/vector-store";

import { fetchArxivByIds, fetchArxivPage } from "./collectors/arxiv/client.js";
import { fetchOpenAlexPage } from "./collectors/openalex/client.js";
import { DEFAULT_INGEST_CONFIG } from "./config.js";
import { createAlertSink } from "./alerts/sink.js";
import { notify } from "./alerts/notify.js";
import { budgetStopAlert, environmentBudget } from "./budget/budget-stop.js";
import { createAuthorGuard } from "./privacy/author-guard.js";
import { createAuthorKeyHasher } from "./privacy/author-key.js";
import { logLine } from "./log-line.js";
import { createPdfFetcher } from "./documents/safe-fetch.js";
import { extractPdfText } from "./documents/pdf-text.js";
import { loadProcessingConfig, type ProcessingConfig } from "./processing-config.js";
import { PRICE_TABLE } from "./prices.js";
import { createModelUsageStore, type ModelBudget } from "./store/model-usage.js";
import { type ObjectStore } from "./documents/object-store.js";
import { ARXIV_MIN_REQUEST_INTERVAL_MS, createRateLimiter } from "./http/rate-limit.js";
import { consumeBatch } from "./queue/consume.js";
import { type CandidateWorkflowBinding, type PipelineDeps } from "./queue/deps.js";
import { type QueueBatchLike, type QueueSender } from "./queue/types.js";
import { runScheduled } from "./schedule/run-scheduled.js";
import {
  runCandidatePipeline,
  type CandidatePipelineOutcome,
  type CandidateRunParams,
  type StepRunner,
} from "./candidate/pipeline.js";
import { STUB_STEPS } from "./candidate/steps.js";
import { type SqlDatabase } from "./store/sql.js";

/** Bindings declared in infrastructure/cloudflare/wrangler.toml. */
export type Env = {
  ENVIRONMENT: string;
  DB: SqlDatabase;
  DOCUMENTS: ObjectStore;
  PUBLICATION_QUEUE: QueueSender;
  /** PDF downloads, consumed apart from the pages (ADR 0047). */
  DOCUMENT_QUEUE: QueueSender;
  /** Text extraction of stored PDFs, one file per invocation (ADR 0009, ADR 0053). */
  TEXT_QUEUE?: QueueSender;
  /** Model steps, triage and extraction; concurrency 8 bounds calls in flight (ADR 0053). */
  MODEL_QUEUE?: QueueSender;
  /** Workers AI, always called through the environment's AI Gateway (REQ-NFR-003). */
  AI?: WorkersAiBinding;
  /** Embeddings, 50 per batch and one model call per batch (ADR 0053). */
  EMBEDDING_QUEUE?: QueueSender;
  /** Vectorize `roi-publications-<env>`, the current index of the registry (ADR 0056). */
  PUBLICATION_VECTORS?: VectorIndex;
  /** The index of a new embedding model during its backfill, when one is bound (ADR 0056). */
  PUBLICATION_VECTORS_NEXT?: VectorIndex;
  /** Worker secret; the name is listed in docs/kt/operations.md. */
  OPENALEX_API_KEY?: string;
  /**
   * Worker secret (at least 32 random characters). It keys the erasure list; without it
   * ingestion stops rather than store an erased author again (REQ-NFR-016).
   */
  ERASURE_HASH_KEY?: string;
  /** Alert delivery (REQ-NFR-019). A channel without its settings is skipped. */
  ALERT_GITHUB_REPO?: string;
  /** Worker secret: a fine-grained token limited to issues on this repository. */
  ALERT_GITHUB_TOKEN?: string;
  /** Worker secret; the key that sends alert emails. */
  RESEND_API_KEY?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
  /** `processing.enabled` (`"true"` or `"false"`); unset means off. See processing-config.ts. */
  PROCESSING_ENABLED?: string;
  /** `budget.expected_daily_triaged` and `budget.expected_daily_embeddings` of the environment (ADR 0059). */
  BUDGET_EXPECTED_DAILY_TRIAGED?: string;
  BUDGET_EXPECTED_DAILY_EMBEDDINGS?: string;
  /** The candidate Workflow of the thin slice; bound in local and preview only (ADR 0117). */
  CANDIDATE_WORKFLOW?: CandidateWorkflowBinding;
};

type WorkersAiBinding = CallModelDeps["Ai"];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Not `fetch` itself: calling it detached from the global scope fails in Workers.
const workerFetch: typeof fetch = (input, init) => fetch(input, init);
// One limiter per isolate, not per page: a retried page in the same isolate still waits
// for the arXiv request interval after the request before it (REQ-DATA-002).
const arxivSlot = createRateLimiter({
  MinIntervalMs: ARXIV_MIN_REQUEST_INTERVAL_MS,
  Now: () => Date.now(),
  Sleep: sleep,
});

/**
 * Triage and extraction share one model queue, one usage store, and one budget (ADR 0053,
 * ADR 0059). New messages are sent only where `processing.enabled` is on.
 */
function modelSteps(
  env: Env,
  ai: NonNullable<Env["AI"]>,
  processing: ProcessingConfig,
  budget: ModelBudget,
): Pick<PipelineDeps, "Triage" | "Extraction" | "Embedding"> {
  const queue = processing.Enabled && env.MODEL_QUEUE ? { Queue: env.MODEL_QUEUE } : {};
  const call = {
    Ai: ai,
    GatewayId: `roi-${env.ENVIRONMENT}`,
    Usage: createModelUsageStore(env.DB, budget),
    Prices: PRICE_TABLE,
    MaxAttempts: processing.ModelMaxAttempts,
    NewId: () => crypto.randomUUID(),
    Now: () => new Date(),
    Sleep: sleep,
  };
  return {
    Triage: {
      ...queue,
      Call: call,
      Model: processing.TriageModel,
      AcceptScoreCut: processing.AcceptScoreCut,
      Admission: {
        DailyLimit: processing.DailyExtractionLimit,
        PoolDays: processing.AdmissionPoolDays,
        FullTextWaitHours: processing.FullTextWaitHours,
      },
    },
    Extraction: {
      ...queue,
      Call: call,
      Model: processing.ExtractionModel,
      MaxCandidates: processing.MaxCandidates,
      FullTextMaxChars: processing.FullTextMaxChars,
      GenericCustomerTerms: processing.GenericCustomerTerms,
    },
    ...(env.PUBLICATION_VECTORS
      ? {
          Embedding: {
            ...(processing.Enabled && env.EMBEDDING_QUEUE ? { Queue: env.EMBEDDING_QUEUE } : {}),
            Call: call,
            Environment: env.ENVIRONMENT,
            Indexes: {
              PUBLICATION_VECTORS: env.PUBLICATION_VECTORS,
              ...(env.PUBLICATION_VECTORS_NEXT
                ? { PUBLICATION_VECTORS_NEXT: env.PUBLICATION_VECTORS_NEXT }
                : {}),
            },
          },
        }
      : {}),
  };
}

function buildDeps(env: Env): PipelineDeps {
  const config = DEFAULT_INGEST_CONFIG;
  const backoff = {
    MaxAttempts: config.Http.MaxAttempts,
    BaseMs: config.Http.BaseMs,
    Sleep: sleep,
  };
  const log = (event: string, fields: Record<string, unknown>) =>
    console.log(logLine(env.ENVIRONMENT, event, fields));
  const processing = loadProcessingConfig(env);
  // The day's model budget (ADR 0059); its first refusal sends the day's one budget-stop alert.
  const budget = environmentBudget({
    Db: env.DB,
    Processing: processing,
    Prices: PRICE_TABLE,
    OnStop: (stop) => notify(deps, budgetStopAlert(stop)),
    Log: log,
  });
  const deps: PipelineDeps = {
    Db: env.DB,
    Queue: env.PUBLICATION_QUEUE,
    DocumentQueue: env.DOCUMENT_QUEUE,
    Now: () => new Date().toISOString(),
    NewId: () => crypto.randomUUID(),
    Config: config,
    Documents: env.DOCUMENTS,
    AuthorGuard: createAuthorGuard(env.DB, createAuthorKeyHasher(env.ERASURE_HASH_KEY)),
    FetchPdf: createPdfFetcher({
      Fetch: workerFetch,
      Limits: {
        MaxBytes: config.Pdf.MaxBytes,
        TimeoutMs: config.Pdf.TimeoutMs,
        MaxRedirects: config.Pdf.MaxRedirects,
        AllowedHosts: config.Pdf.AllowedHosts,
      },
    }),
    Log: log,
    // Text is consumed whenever a message arrives; new messages are sent only where
    // `processing.enabled` is on (REQ-DATA-006).
    Text: {
      ...(processing.Enabled && env.TEXT_QUEUE ? { Queue: env.TEXT_QUEUE } : {}),
      Extract: extractPdfText,
      Limits: {
        MaxPdfBytes: processing.TextMaxPdfBytes,
        MaxPages: processing.TextMaxPages,
        MinChars: processing.TextMinChars,
        BackfillPerRun: processing.TextBackfillPerRun,
      },
    },
    ...(env.AI ? modelSteps(env, env.AI, processing, budget) : {}),
    ...(env.CANDIDATE_WORKFLOW
      ? { Candidate: { Workflow: env.CANDIDATE_WORKFLOW, Steps: STUB_STEPS } }
      : {}),
    Retraction: { LookbackDays: processing.RetractionLookbackDays },
    Monitor: {
      BaselineDays: processing.MonitorBaselineDays,
      DriftBand: processing.MonitorDriftBand,
      MinDailyItems: processing.MonitorMinDailyItems,
      NearDuplicateCosine: processing.MonitorNearDuplicateCosine,
    },
    Recovery: {
      MaxRedrives: processing.MaxRedrives,
      MaxRedrivesPerDay: processing.MaxRedrivesPerDay,
      DeadLetterReplayHours: processing.DeadLetterReplayHours,
      BreakerFailureShare: processing.BreakerFailureShare,
      BreakerMinCalls: processing.BreakerMinCalls,
    },
    Alert: createAlertSink({
      Db: env.DB,
      Fetch: workerFetch,
      Backoff: backoff,
      Now: () => new Date().toISOString(),
      Environment: env.ENVIRONMENT,
      Log: log,
      ...(env.ALERT_GITHUB_REPO && env.ALERT_GITHUB_TOKEN
        ? { Github: { Repo: env.ALERT_GITHUB_REPO, Token: env.ALERT_GITHUB_TOKEN } }
        : {}),
      ...(env.RESEND_API_KEY && env.ALERT_EMAIL_TO && env.ALERT_EMAIL_FROM
        ? {
            Email: {
              ApiKey: env.RESEND_API_KEY,
              To: env.ALERT_EMAIL_TO,
              From: env.ALERT_EMAIL_FROM,
            },
          }
        : {}),
    }),
    Sources: {
      FetchOpenAlexPage: (request) =>
        fetchOpenAlexPage(
          {
            FromDate: request.FromDate,
            ...(request.ToDate ? { ToDate: request.ToDate } : {}),
            PerPage: config.PageSize,
            ...(request.SubfieldIds ? { SubfieldIds: request.SubfieldIds } : {}),
            WorkTypes: config.OpenAlexScope.WorkTypes,
            RequireAbstract: config.OpenAlexScope.RequireAbstract,
            ...(request.Cursor ? { Cursor: request.Cursor } : {}),
            ...(request.Retracted ? { Retracted: true } : {}),
            ...(request.Page !== undefined ? { Page: request.Page } : {}),
            ...(env.OPENALEX_API_KEY ? { ApiKey: env.OPENALEX_API_KEY } : {}),
          },
          {
            Fetch: workerFetch,
            Backoff: backoff,
            MaxResponseBytes: config.Http.MaxResponseBytes,
          },
        ),
      FetchArxivPage: (request) =>
        fetchArxivPage(
          {
            Start: request.Start,
            MaxResults: request.MaxResults,
            ...(request.SubmittedFrom ? { SubmittedFrom: request.SubmittedFrom } : {}),
            ...(request.SubmittedTo ? { SubmittedTo: request.SubmittedTo } : {}),
          },
          {
            Fetch: workerFetch,
            Backoff: backoff,
            WaitForSlot: arxivSlot,
            MaxResponseBytes: config.Http.MaxResponseBytes,
          },
        ),
      FetchArxivByIds: (ids) =>
        fetchArxivByIds(ids, {
          Fetch: workerFetch,
          Backoff: backoff,
          WaitForSlot: arxivSlot,
          MaxResponseBytes: config.Http.MaxResponseBytes,
        }),
    },
  };
  return deps;
}

/**
 * Collector Worker entry (REQ-NFR-002): a health check, the cron handler that starts a
 * run (REQ-DATA-009), and the queue handler for pages, PDFs, texts, triage, and dead
 * letters (REQ-DATA-011, REQ-DATA-006, REQ-PROC-005).
 */
/**
 * The candidate Workflow (ADR 0003, REQ-PROC-007): one instance per pipeline run, one durable
 * step per agent, then scoring. In phase 2 every agent is a stub (ADR 0117).
 */
export class CandidateWorkflow extends WorkflowEntrypoint<Env, CandidateRunParams> {
  async run(
    event: { payload: Readonly<CandidateRunParams> },
    step: StepRunner,
  ): Promise<CandidatePipelineOutcome> {
    return runCandidatePipeline({ ...buildDeps(this.env), Steps: STUB_STEPS }, step, {
      PipelineRunId: event.payload.PipelineRunId,
    });
  }
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return Response.json({ service: "roi-pipeline", environment: env.ENVIRONMENT });
  },

  async scheduled(controller: { cron: string }, env: Env): Promise<void> {
    await runScheduled(buildDeps(env), controller.cron);
  },

  async queue(batch: QueueBatchLike, env: Env): Promise<void> {
    await consumeBatch(buildDeps(env), batch);
  },
};
