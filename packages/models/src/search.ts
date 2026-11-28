import { z } from "zod";

import { IsoDateTimeSchema } from "./common.js";

/**
 * The search tool's I/O (REQ-AGENT-013, `docs/kt/architecture/defaults.md` "Search tool I/O").
 * A result is untrusted web content: it reaches a prompt only inside the search-results
 * delimiters (REQ-NFR-006), and evidence cites it by URL with its retrieval time (REQ-AGENT-008).
 */

/** A query of 3 to 300 characters, after trimming. */
export const SearchQuerySchema = z.string().trim().min(3).max(300);

export const SearchResultSchema = z
  .object({
    Title: z.string().max(300),
    /** Only `https` results are kept. */
    Url: z
      .string()
      .url()
      .max(2048)
      .refine((url) => url.startsWith("https://"), "a result URL is https"),
    Snippet: z.string().max(500),
    RetrievedAt: IsoDateTimeSchema,
  })
  .strict();
export type SearchResult = z.infer<typeof SearchResultSchema>;
