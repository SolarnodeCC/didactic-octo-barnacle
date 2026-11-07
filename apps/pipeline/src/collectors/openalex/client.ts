import { fetchWithBackoff, type BackoffOptions, type FetchFn } from "../../http/retry.js";
import { type OpenAlexWork } from "./types.js";

export type OpenAlexPageRequest = {
  /** First publication date to fetch, YYYY-MM-DD (REQ-DATA-009 computes it from the cursor). */
  FromDate: string;
  /**
   * Last publication date to fetch, YYYY-MM-DD: the day of the run (REQ-DATA-009 AC7). OpenAlex
   * lists works with a publication date in the future, and the newest-first sort would return
   * them before any real date. Omitted, no upper bound is sent.
   */
  ToDate?: string;
  /** Cursor from the previous page; omit for the first page. */
  Cursor?: string;
  PerPage?: number;
  /**
   * OpenAlex subfield IDs of the topic map (REQ-DATA-001 AC1), matched against the work's
   * primary topic (ADR 0041). Empty or omitted sends no topic filter. English is always
   * required: the pilot is English only.
   */
  SubfieldIds?: readonly string[];
  /** OpenAlex work types to fetch, sent as `type:A|B` (ADR 0048). Empty or omitted sends none. */
  WorkTypes?: readonly string[];
  /** Sends `has_abstract:true` (ADR 0048). */
  RequireAbstract?: boolean;
  /**
   * From the `OPENALEX_API_KEY` secret (docs/kt/operations.md). Required for cursor
   * paging past the first page (ADR 0034); omit only for a keyless single-page smoke test.
   */
  ApiKey?: string;
};

export type OpenAlexPage = {
  Works: OpenAlexWork[];
  /** Null on the last page. */
  NextCursor: string | null;
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
  meta?: { next_cursor?: string | null };
};

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";

/**
 * The root fields the mapper and the scope filter read (`types.ts`). Without `select`,
 * OpenAlex returns every field of a work (referenced works, locations, concepts, ...),
 * which is several times larger to download and parse (REQ-NFR-010).
 */
export const OPENALEX_WORK_FIELDS = [
  "id",
  "title",
  "display_name",
  "type",
  "publication_date",
  "doi",
  "ids",
  "abstract_inverted_index",
  "authorships",
  "topics",
  "primary_topic",
  "cited_by_count",
  "language",
  "is_retracted",
  "open_access",
  "primary_location",
] as const;

export function buildOpenAlexUrl(request: OpenAlexPageRequest): string {
  const params = new URLSearchParams();
  const filters = [`from_publication_date:${request.FromDate}`];
  if (request.ToDate) {
    filters.push(`to_publication_date:${request.ToDate}`);
  }
  filters.push("language:en");
  const subfields = (request.SubfieldIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (subfields.length > 0) {
    // One filter with OR values; OpenAlex allows at most 100 of them. Only the primary
    // topic counts: any of up to three topics matched about six times as many works (ADR 0041).
    filters.push(`primary_topic.subfield.id:${subfields.join("|")}`);
  }
  const types = (request.WorkTypes ?? []).map((type) => type.trim()).filter(Boolean);
  if (types.length > 0) {
    filters.push(`type:${types.join("|")}`);
  }
  if (request.RequireAbstract) {
    filters.push("has_abstract:true");
  }
  params.set("filter", filters.join(","));
  // An explicit sort keeps the cursor order stable between runs, so a continued run reaches
  // new works instead of re-reading ones whose internal ranking moved (ADR 0041).
  params.set("sort", "publication_date:desc");
  params.set("select", OPENALEX_WORK_FIELDS.join(","));
  params.set("per-page", String(request.PerPage ?? 100));
  params.set("cursor", request.Cursor ?? "*");
  return `${OPENALEX_WORKS_URL}?${params.toString()}`;
}

function openAlexHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Fetch one page of works (REQ-DATA-001); failed requests retry with backoff. */
export async function fetchOpenAlexPage(
  request: OpenAlexPageRequest,
  deps: { Fetch: FetchFn; Backoff: BackoffOptions },
): Promise<OpenAlexPage> {
  const response = await fetchWithBackoff(
    deps.Fetch,
    buildOpenAlexUrl(request),
    { headers: openAlexHeaders(request.ApiKey) },
    deps.Backoff,
  );
  const body = (await response.json()) as OpenAlexResponse;
  return {
    Works: body.results ?? [],
    NextCursor: body.meta?.next_cursor ?? null,
  };
}
