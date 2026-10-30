import { fetchArxivPage } from "./collectors/arxiv/client.js";
import { fetchOpenAlexPage } from "./collectors/openalex/client.js";
import { DEFAULT_INGEST_CONFIG } from "./config.js";
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
  DOCUMENTS: unknown;
  PUBLICATION_QUEUE: QueueSender;
  /** Worker secret; the name is listed in docs/kt/operations.md. */
  OPENALEX_API_KEY?: string;
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
  return {
    Db: env.DB,
    Queue: env.PUBLICATION_QUEUE,
    Now: () => new Date().toISOString(),
    NewId: () => crypto.randomUUID(),
    Config: config,
    Log: (event, fields) => console.log(JSON.stringify({ event, env: env.ENVIRONMENT, ...fields })),
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
