import {
  RecordVerdictRequestSchema,
  REVIEW_DAILY_SAMPLE_DEFAULT,
  ReviewListQuerySchema,
  ReviewQueueQuerySchema,
  UndoVerdictRequestSchema,
} from "@roi/models";

import { ACCESS_HEADER, type AccessIdentity } from "./access.js";
import { errorResponse, json, jsonLines, sameOrigin } from "./http.js";
import { getQueue } from "./queue.js";
import { type SqlDatabase } from "./sql.js";
import {
  CursorError,
  exportVerdicts,
  getPublication,
  listPublications,
  recordVerdict,
  reviewStats,
  undoVerdict,
} from "./store.js";

/**
 * The API of the owner review tool under `/api/review/` (ADR 0116). Every request is
 * authenticated first (REQ-REV-005); writes also need a same-origin `Origin` (REQ-NFR-014).
 */

export type Authenticator = (token: string | null) => Promise<AccessIdentity | null>;

export type AppDeps = {
  Db: SqlDatabase;
  /** Null while Access is not configured: every request is then refused. */
  Authenticate: Authenticator | null;
  NewId: () => string;
  Now: () => string;
  /** Publications in the daily review sample (REQ-REV-006). */
  SampleSize?: number;
};

const PUBLICATION_PATH = /^\/api\/review\/publications\/([^/]+)$/u;
const BODY_LIMIT = 16 * 1024;

/** Query parameters, with the camel-case keys of the URL mapped to the schema's keys. */
function listQuery(url: URL): Record<string, string> {
  const names: Record<string, string> = {
    accepted: "Accepted",
    reason: "Reason",
    reviewed: "Reviewed",
    promptVersion: "PromptVersion",
    day: "Day",
    cursor: "Cursor",
    limit: "Limit",
  };
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    const name = names[key] ?? key;
    if (value !== "") {
      query[name] = value;
    }
  }
  return query;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > BODY_LIMIT) {
    throw new SyntaxError("body too large");
  }
  return JSON.parse(text) as unknown;
}

export async function handleApi(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.Authenticate) {
    return errorResponse("not-configured", "Access is not configured for this environment");
  }
  const identity = await deps.Authenticate(request.headers.get(ACCESS_HEADER));
  if (!identity) {
    return errorResponse("unauthorized", "a valid Cloudflare Access token is required");
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, "");
  const method = request.method;

  if (path === "/api/review/publications") {
    if (method !== "GET") return errorResponse("method-not-allowed", "use GET");
    const parsed = ReviewListQuerySchema.safeParse(listQuery(url));
    if (!parsed.success) {
      return errorResponse("validation", parsed.error.issues.map((i) => i.message).join("; "));
    }
    try {
      return json(await listPublications(deps.Db, parsed.data));
    } catch (error) {
      if (error instanceof CursorError) return errorResponse("validation", error.message);
      throw error;
    }
  }

  const match = PUBLICATION_PATH.exec(path);
  if (match) {
    if (method !== "GET") return errorResponse("method-not-allowed", "use GET");
    const detail = await getPublication(deps.Db, decodeURIComponent(match[1] as string));
    return detail
      ? json(detail)
      : errorResponse("not-found", "no triaged publication with this ID");
  }

  if (path === "/api/review/verdicts" || path === "/api/review/undo") {
    if (method !== "POST") return errorResponse("method-not-allowed", "use POST");
    if (!sameOrigin(request)) {
      return errorResponse("forbidden", "the Origin header must match this site");
    }
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      return errorResponse("validation", "the body must be a JSON object of at most 16 KiB");
    }
    if (path === "/api/review/undo") {
      const undo = UndoVerdictRequestSchema.safeParse(body);
      if (!undo.success) {
        return errorResponse("validation", undo.error.issues.map((i) => i.message).join("; "));
      }
      const undone = await undoVerdict(deps, undo.data.TargetKind, undo.data.TargetId);
      return undone ? json(undone) : errorResponse("not-found", "no verdict to undo");
    }
    const parsed = RecordVerdictRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("validation", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const result = await recordVerdict(deps, parsed.data, identity.Subject);
    if (result.Kind === "not-found") {
      return errorResponse("not-found", `no ${parsed.data.TargetKind} with this ID`);
    }
    if (result.Kind === "invalid") {
      return errorResponse("validation", result.Message);
    }
    return json(result.Current, 201);
  }

  if (path === "/api/review/queue") {
    if (method !== "GET") return errorResponse("method-not-allowed", "use GET");
    const day = url.searchParams.get("day");
    const parsed = ReviewQueueQuerySchema.safeParse(day ? { Day: day } : {});
    if (!parsed.success) {
      return errorResponse("validation", "day must be YYYY-MM-DD");
    }
    return json(
      await getQueue(deps.Db, {
        Day: parsed.data.Day,
        Size: deps.SampleSize ?? REVIEW_DAILY_SAMPLE_DEFAULT,
        Now: deps.Now(),
      }),
    );
  }

  if (path === "/api/review/stats") {
    if (method !== "GET") return errorResponse("method-not-allowed", "use GET");
    return json({ Rows: await reviewStats(deps.Db) });
  }

  if (path === "/api/review/export") {
    if (method !== "GET") return errorResponse("method-not-allowed", "use GET");
    return jsonLines(await exportVerdicts(deps.Db), "review-verdicts.jsonl");
  }

  return errorResponse("not-found", "no such route");
}
