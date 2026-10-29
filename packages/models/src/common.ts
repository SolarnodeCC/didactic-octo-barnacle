import { z } from "zod";

/** ISO 8601 calendar date (YYYY-MM-DD). */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** ISO 8601 timestamp with timezone offset or Z. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const SourceNameSchema = z.enum(["openalex", "arxiv", "semantic-scholar"]);
export type SourceName = z.infer<typeof SourceNameSchema>;

export const CompletenessSchema = z.enum(["complete", "incomplete"]);
export type Completeness = z.infer<typeof CompletenessSchema>;

/**
 * Normalize a DOI for comparison (REQ-DATA-007).
 * Lowercase and strip a leading https://doi.org/ or http://doi.org/ prefix.
 */
export function normalizeDoi(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.replace(/^https?:\/\/doi\.org\//, "");
}

export const DoiSchema = z.string().min(1).transform(normalizeDoi).pipe(z.string().min(1));

/** arXiv id without version suffix, for example 2401.12345. */
export const ArxivIdSchema = z
  .string()
  .regex(/^\d{4}\.\d{4,5}(v\d+)?$/, "expected an arXiv id such as 2401.12345 or 2401.12345v2");

export function stripArxivVersion(arxivId: string): string {
  return arxivId.replace(/v\d+$/i, "");
}

export function parseArxivVersion(arxivId: string): number | null {
  const match = /v(\d+)$/i.exec(arxivId);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}
