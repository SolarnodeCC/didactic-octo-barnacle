import { fetchWithBackoff, type BackoffOptions, type FetchFn } from "../../http/retry.js";
import { isArxivCategoryInScope, SCOPE_ARXIV_CATEGORIES } from "../../normalize/scope.js";
import { parseArxivFeed } from "./parse-feed.js";
import { type ArxivEntry } from "./types.js";

export type ArxivPageRequest = {
  Start?: number;
  MaxResults?: number;
  Categories?: readonly string[];
  /**
   * First day (YYYY-MM-DD) on which the first version of a preprint may have been
   * submitted. Sent as a `submittedDate` range, so older preprints are never returned, also
   * when they have a new version (REQ-DATA-009 AC3 and AC6). Omit for no limit.
   */
  SubmittedFrom?: string;
  /** Last day (YYYY-MM-DD) of that range; the day of the run. Defaults to a far future day. */
  SubmittedTo?: string;
};

export type ArxivPage = {
  /** Entries whose primary or cross-listed category is in scope (REQ-DATA-002 AC1). */
  Entries: ArxivEntry[];
  /** Entries the API returned that are out of scope and were dropped. */
  OutOfScope: number;
  /** Entries on the page before filtering; zero means the last page. */
  Returned: number;
};

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

/** `2026-08-07` becomes `202608070000` (or `202608072359` for the end of the day), in GMT. */
function arxivDateTime(day: string, endOfDay: boolean): string {
  return `${day.replaceAll("-", "")}${endOfDay ? "2359" : "0000"}`;
}

export function buildArxivUrl(request: ArxivPageRequest): string {
  const categories = request.Categories ?? SCOPE_ARXIV_CATEGORIES;
  const categoryQuery = categories.map((category) => `cat:${category}`).join(" OR ");
  const query = request.SubmittedFrom
    ? `(${categoryQuery}) AND submittedDate:[${arxivDateTime(request.SubmittedFrom, false)} TO ${arxivDateTime(request.SubmittedTo ?? "2999-12-31", true)}]`
    : categoryQuery;
  const params = new URLSearchParams({
    search_query: query,
    start: String(request.Start ?? 0),
    max_results: String(request.MaxResults ?? 100),
    sortBy: "lastUpdatedDate",
    sortOrder: "descending",
  });
  return `${ARXIV_API_URL}?${params.toString()}`;
}

/**
 * Fetch one page of preprints (REQ-DATA-002). `WaitForSlot` is the rate limiter
 * from `createRateLimiter`; it is awaited before every request including retries
 * of the same page, so the arXiv limit holds.
 */
export async function fetchArxivPage(
  request: ArxivPageRequest,
  deps: { Fetch: FetchFn; Backoff: BackoffOptions; WaitForSlot: () => Promise<void> },
): Promise<ArxivPage> {
  const categories = request.Categories ?? SCOPE_ARXIV_CATEGORIES;
  const rateLimitedFetch: FetchFn = async (input, init) => {
    await deps.WaitForSlot();
    return deps.Fetch(input, init);
  };
  const response = await fetchWithBackoff(
    rateLimitedFetch,
    buildArxivUrl(request),
    { headers: { accept: "application/atom+xml" } },
    deps.Backoff,
  );
  const returned = parseArxivFeed(await response.text());
  const entries = returned.filter((entry) =>
    isArxivCategoryInScope([entry.primaryCategory, ...entry.categories], categories),
  );
  return {
    Entries: entries,
    OutOfScope: returned.length - entries.length,
    Returned: returned.length,
  };
}
