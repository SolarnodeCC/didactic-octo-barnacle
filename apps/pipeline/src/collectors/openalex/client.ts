import { fetchWithBackoff, type BackoffOptions, type FetchFn } from "../../http/retry.js";
import { type OpenAlexWork } from "./types.js";

export type OpenAlexPageRequest = {
  /** First publication date to fetch, YYYY-MM-DD (REQ-DATA-009 computes it from the cursor). */
  FromDate: string;
  /** Cursor from the previous page; omit for the first page. */
  Cursor?: string;
  PerPage?: number;
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

export function buildOpenAlexUrl(request: OpenAlexPageRequest): string {
  const params = new URLSearchParams();
  params.set("filter", `from_publication_date:${request.FromDate}`);
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
