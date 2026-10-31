import { z } from "zod";

import { fetchWithBackoff, type BackoffOptions, type FetchFn } from "../../http/retry.js";
import { type OpenAlexWork } from "./types.js";

export type OpenAlexPageRequest = {
  /** First publication date to fetch, YYYY-MM-DD (REQ-DATA-009 computes it from the cursor). */
  FromDate: string;
  /** Cursor from the previous page; omit for the first page. */
  Cursor?: string;
  PerPage?: number;
  /** From the `OPENALEX_API_KEY` secret; the name is in docs/kt/operations.md. */
  ApiKey?: string;
  /** Contact email, used when no key is set (docs/kt/data-sources/openalex.md). */
  Mailto?: string;
};

export type OpenAlexPage = {
  Works: OpenAlexWork[];
  /** Null on the last page. */
  NextCursor: string | null;
};

/**
 * The envelope of a page is checked at the boundary. Single works stay loosely typed here
 * on purpose: the mapper rejects a bad work and the run records it, so one odd record
 * does not fail the whole page (REQ-DATA-001 AC3).
 */
const OpenAlexResponseSchema = z.object({
  results: z.array(z.unknown()).default([]),
  meta: z.object({ next_cursor: z.string().nullable().optional() }).optional(),
});

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";

export function buildOpenAlexUrl(request: OpenAlexPageRequest): string {
  const params = new URLSearchParams();
  params.set("filter", `from_publication_date:${request.FromDate}`);
  params.set("per-page", String(request.PerPage ?? 100));
  params.set("cursor", request.Cursor ?? "*");
  if (request.ApiKey) {
    params.set("api_key", request.ApiKey);
  } else if (request.Mailto) {
    params.set("mailto", request.Mailto);
  }
  return `${OPENALEX_WORKS_URL}?${params.toString()}`;
}

/** Fetch one page of works (REQ-DATA-001); failed requests retry with backoff. */
export async function fetchOpenAlexPage(
  request: OpenAlexPageRequest,
  deps: { Fetch: FetchFn; Backoff: BackoffOptions },
): Promise<OpenAlexPage> {
  const response = await fetchWithBackoff(
    deps.Fetch,
    buildOpenAlexUrl(request),
    { headers: { accept: "application/json" } },
    deps.Backoff,
  );
  const parsed = OpenAlexResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("OpenAlex returned a page in an unexpected shape");
  }
  return {
    Works: parsed.data.results as OpenAlexWork[],
    NextCursor: parsed.data.meta?.next_cursor ?? null,
  };
}
