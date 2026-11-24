import { handleApiRequest } from "./handler.js";
import { type SqlDatabase } from "./sql.js";

/** Bindings of apps/api/wrangler.toml: the pipeline's database, read only by this Worker. */
export type Env = {
  DB: SqlDatabase;
  ENVIRONMENT: string;
};

/** The data API Worker of the thin slice (ADR 0058): local and preview only. */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleApiRequest(env.DB, request);
  },
};
