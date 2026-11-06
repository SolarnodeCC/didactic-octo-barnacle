import { z } from "zod";

import { missingQuotes } from "./agent-contract.js";

/** Opportunity extraction contract (docs/kt/agents/opportunity-extraction.md, REQ-PROC-009). */

export const ExtractionCandidateSchema = z
  .object({
    Finding: z.string().min(1).max(280),
    EvidenceQuote: z.string().min(1).max(500),
    Customer: z.string().min(1).max(120),
    CustomerQuote: z.string().min(1).max(500),
    WhyNow: z.string().max(200).nullable(),
    WhyNowQuote: z.string().max(500).nullable(),
    CurrentAlternative: z.string().max(200).nullable(),
    AlternativeQuote: z.string().max(500).nullable(),
  })
  .superRefine((candidate, ctx) => {
    if ((candidate.WhyNow === null) !== (candidate.WhyNowQuote === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["WhyNowQuote"],
        message: "WhyNow and WhyNowQuote are set together",
      });
    }
    if ((candidate.CurrentAlternative === null) !== (candidate.AlternativeQuote === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["AlternativeQuote"],
        message: "CurrentAlternative and AlternativeQuote are set together",
      });
    }
  });
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

/** `extraction.max_candidates_per_publication` (docs/kt/architecture/defaults.md, REQ-PROC-004). */
export const DEFAULT_MAX_CANDIDATES = 3;

export function extractionOutputSchema(maxCandidates: number = DEFAULT_MAX_CANDIDATES) {
  return z
    .object({
      Candidates: z.array(ExtractionCandidateSchema).max(maxCandidates),
      Confidence: z.number().min(0).max(1),
      Notes: z.string().max(400).nullable(),
    })
    .superRefine((output, ctx) => {
      if (output.Candidates.length === 0 && !output.Notes) {
        ctx.addIssue({
          code: "custom",
          path: ["Notes"],
          message: "Notes must say why no candidate was found",
        });
      }
    });
}
export type ExtractionOutput = z.infer<ReturnType<typeof extractionOutputSchema>>;

/**
 * Quote fields of the output that are not verbatim in the publication text, as
 * `Candidates[i].Field`. Any entry rejects the output (REQ-PROC-009, REQ-AGENT-008).
 */
export function extractionMissingQuotes(output: ExtractionOutput, text: string): string[] {
  return output.Candidates.flatMap((candidate, index) =>
    missingQuotes(
      (["EvidenceQuote", "CustomerQuote", "WhyNowQuote", "AlternativeQuote"] as const).map(
        (field) => ({ Field: `Candidates[${index}].${field}`, Quote: candidate[field] }),
      ),
      text,
    ),
  );
}
