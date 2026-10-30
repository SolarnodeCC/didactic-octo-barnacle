import { fetchArxivPage } from "./collectors/arxiv/client.js";
import { fetchOpenAlexPage } from "./collectors/openalex/client.js";
import { DEFAULT_INGEST_CONFIG } from "./config.js";
import { createAlertSink } from "./alerts/sink.js";
import { createAuthorGuard } from "./privacy/author-guard.js";
import { createAuthorKeyHasher } from "./privacy/author-key.js";
import { logLine } from "./log-line.js";
import { createPdfFetcher } from "./documents/safe-fetch.js";
import { type ObjectStore } from "./documents/object-store.js";
import { ARXIV_MIN_REQUEST_INTERVAL_MS, createRateLimiter } from "./http/rate-limit.js";
import { consumeBatch } from "./queue/consume.js";
import { type PipelineDeps } from "./queue/deps.js";
import { type QueueBatchLike, type QueueSender } from "./queue/types.js";
import { runScheduled } from "./schedule/run-scheduled.js";
import { type SqlDatabase } from "./store/sql.js";

/** Bindings declared in infrastructure/cloudflare/wrangler.toml. */
export type Env = {
  ENVIRONMENT: string;
  DB: SqlDatabase;
  DOCUMENTS: ObjectStore;
  PUBLICATION_QUEUE: QueueSender;
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
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Not `fetch` itself: calling it detached from the global scope fails in Workers.
const workerFetch: typeof fetch = (input, init) => fetch(input, init);

function buildDeps(env: Env): PipelineDeps {
  const config = DEFAULT_INGEST_CONFIG;
  const backoff = {
    MaxAttempts: config.Http.MaxAttempts,
    BaseMs: config.Http.BaseMs,
    Sleep: sleep,
  };
  const log = (event: string, fields: Record<string, unknown>) =>
    console.log(logLine(env.ENVIRONMENT, event, fields));
  return {
    Db: env.DB,
    Queue: env.PUBLICATION_QUEUE,
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
            PerPage: config.PageSize,
            ...(request.Cursor ? { Cursor: request.Cursor } : {}),
            ...(env.OPENALEX_API_KEY ? { ApiKey: env.OPENALEX_API_KEY } : {}),
          },
          { Fetch: workerFetch, Backoff: backoff },
        ),
      FetchArxivPage: (request) =>
        fetchArxivPage(
          { Start: request.Start, MaxResults: request.MaxResults },
          {
            Fetch: workerFetch,
            Backoff: backoff,
            WaitForSlot: createRateLimiter({
              MinIntervalMs: ARXIV_MIN_REQUEST_INTERVAL_MS,
              Now: () => Date.now(),
              Sleep: sleep,
            }),
          },
        ),
    },
  };
}

/**
 * Collector Worker entry (REQ-NFR-002): a health check, the cron handler that starts a
 * run (REQ-DATA-009), and the queue handler for pages and dead letters (REQ-DATA-011).
 */
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
