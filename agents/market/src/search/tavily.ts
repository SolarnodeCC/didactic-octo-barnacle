import { SearchResultSchema, type SearchResult } from "@roi/models";
import { z } from "zod";

/**
 * The Tavily Search REST call (ADR 0126). The only place the provider's URL appears: agents
 * reach it through `createSearchTool`, never directly (REQ-AGENT-013 AC1). It uses `fetch`, not
 * `@tavily/core`, so it runs in a Worker.
 */

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

/** The most read from one response; a basic search with five results is a few kilobytes. */
export const MAX_RESPONSE_BYTES = 1_048_576;

const TITLE_MAX = 300;
const SNIPPET_MAX = 500;

export type SearchDepth = "basic" | "advanced";

export type TavilyRequest = {
  Query: string;
  MaxResults: number;
  Depth: SearchDepth;
  TimeoutMs: number;
};

export type TavilyResponse = {
  Results: SearchResult[];
};

export type SearchFailure = "timeout" | "network" | "http" | "too-large" | "malformed";

/** A failed call. The message names the failure class only, never the key or the body. */
export class SearchProviderError extends Error {
  readonly Failure: SearchFailure;
  readonly Status: number | null;

  constructor(failure: SearchFailure, status: number | null = null) {
    super(`search provider call failed: ${failure}${status === null ? "" : ` (${status})`}`);
    this.name = "SearchProviderError";
    this.Failure = failure;
    this.Status = status;
  }
}

const TavilyBodySchema = z.object({
  results: z.array(
    z.object({
      title: z.string().nullish(),
      url: z.string(),
      content: z.string().nullish(),
    }),
  ),
});

function cut(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) {
    return "";
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SearchProviderError("too-large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Maps the provider's results to the tool's I/O: https only, cut to the I/O limits. */
function toResults(body: z.infer<typeof TavilyBodySchema>, max: number, now: Date) {
  const retrievedAt = now.toISOString();
  const results: SearchResult[] = [];
  for (const item of body.results) {
    const parsed = SearchResultSchema.safeParse({
      Title: cut((item.title ?? "").trim(), TITLE_MAX),
      Url: item.url.trim(),
      Snippet: cut((item.content ?? "").trim(), SNIPPET_MAX),
      RetrievedAt: retrievedAt,
    });
    if (parsed.success) {
      results.push(parsed.data);
    }
    if (results.length === max) {
      break;
    }
  }
  return results;
}

/**
 * One search call: a single attempt within the timeout, no generated answer and no raw page
 * content. Throws `SearchProviderError` on a timeout, a network error, a non-2xx status, an
 * oversized response, or a body that does not parse.
 */
export async function tavilySearch(
  fetchFn: typeof fetch,
  apiKey: string,
  request: TavilyRequest,
  now: () => Date,
): Promise<TavilyResponse> {
  let response: Response;
  try {
    response = await fetchFn(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: request.Query,
        max_results: request.MaxResults,
        search_depth: request.Depth,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(request.TimeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new SearchProviderError(
      name === "TimeoutError" || name === "AbortError" ? "timeout" : "network",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new SearchProviderError("http", response.status);
  }
  let text: string;
  try {
    text = await readCapped(response);
  } catch (error) {
    if (error instanceof SearchProviderError) {
      throw error;
    }
    const name = error instanceof Error ? error.name : "";
    throw new SearchProviderError(
      name === "TimeoutError" || name === "AbortError" ? "timeout" : "network",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SearchProviderError("malformed");
  }
  const body = TavilyBodySchema.safeParse(json);
  if (!body.success) {
    throw new SearchProviderError("malformed");
  }
  return { Results: toResults(body.data, request.MaxResults, now()) };
}
