import { type SqlDatabase } from "./store/sql.js";

/** Bindings declared in infrastructure/cloudflare/wrangler.toml. */
export type Env = {
  ENVIRONMENT: string;
  DB: SqlDatabase;
  DOCUMENTS: unknown;
  PUBLICATION_QUEUE: unknown;
  /** Worker secret; the name is listed in docs/kt/operations.md. */
  OPENALEX_API_KEY?: string;
};

/**
 * Collector Worker entry (REQ-NFR-002). It answers a health check; the scheduled
 * and queue handlers arrive with REQ-DATA-009 and REQ-DATA-011.
 */
export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return Response.json({ service: "roi-pipeline", environment: env.ENVIRONMENT });
  },
};
