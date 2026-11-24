import { AccessVerifier, normaliseTeamDomain } from "./access.js";
import { handleApi, type Authenticator } from "./app.js";
import { errorResponse } from "./http.js";
import { type SqlDatabase } from "./sql.js";

/**
 * Worker entry of the owner review tool (ADR 0115). Wrangler runs this script only for
 * `/api/*` (`assets.run_worker_first`); every other path is a static asset of the single-page app.
 */

export type Env = {
  DB: SqlDatabase;
  ENVIRONMENT: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Local development only: a fixed reviewer subject instead of an Access token. */
  ACCESS_DEV_SUBJECT?: string;
};

// Not `fetch` itself: calling it detached from the global scope fails in Workers.
const workerFetch: typeof fetch = (input, init) => fetch(input, init);

let verifier: { Key: string; Verifier: AccessVerifier } | null = null;

/** How requests are authenticated in this environment, or null when that is not configured. */
export function authenticator(env: Env): Authenticator | null {
  if (env.ENVIRONMENT === "local" && env.ACCESS_DEV_SUBJECT) {
    const subject = env.ACCESS_DEV_SUBJECT;
    return () => Promise.resolve({ Subject: subject });
  }
  const teamDomain = normaliseTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = (env.ACCESS_AUD ?? "").trim();
  if (!teamDomain || audience === "") {
    return null;
  }
  const key = `${teamDomain} ${audience}`;
  if (verifier?.Key !== key) {
    verifier = {
      Key: key,
      Verifier: new AccessVerifier({
        TeamDomain: teamDomain,
        Audience: audience,
        Fetch: workerFetch,
        Now: () => Date.now(),
      }),
    };
  }
  const current = verifier.Verifier;
  return (token) => current.verify(token);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/review/")) {
      return errorResponse("not-found", "no such route");
    }
    return handleApi(request, {
      Db: env.DB,
      Authenticate: authenticator(env),
      NewId: () => crypto.randomUUID(),
      Now: () => new Date().toISOString(),
    });
  },
};
