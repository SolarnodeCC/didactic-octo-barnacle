import { z } from "zod";

import { missingQuotes } from "./agent-contract.js";
import { containsPlantedInstruction } from "./injection.js";
import { findQuoteSpan, normalizeForQuote, quoteOccurs } from "./quote.js";

/** The quote fields of a candidate, each checked against the text the step sent. */
const QUOTE_FIELDS = ["EvidenceQuote", "CustomerQuote", "WhyNowQuote", "AlternativeQuote"] as const;

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
 * Quote fields of the output that do not occur in the publication text after normalisation, as
 * `Candidates[i].Field` (REQ-PROC-009 AC3, REQ-AGENT-008 AC2, ADR 0064).
 */
export function extractionMissingQuotes(output: ExtractionOutput, text: string): string[] {
  return output.Candidates.flatMap((candidate, index) =>
    missingQuotes(
      QUOTE_FIELDS.map((field) => ({
        Field: `Candidates[${index}].${field}`,
        Quote: candidate[field],
      })),
      text,
    ),
  );
}

/**
 * `extraction.generic_customer_terms` (ADR 0066): parties that never count as `Customer`. The list
 * changes by reviewed pull request.
 */
export const DEFAULT_GENERIC_CUSTOMER_TERMS: readonly string[] = [
  "users",
  "end users",
  "people",
  "persons",
  "individuals",
  "humans",
  "everyone",
  "society",
  "the public",
];

const LEADING_QUANTIFIERS = ["the ", "all ", "many ", "most "];

function customerKey(text: string): string {
  return normalizeForQuote(text).toLowerCase();
}

/**
 * The customer as two candidates are compared for near-duplicates (ADR 0071): normalised as a
 * quote (ADR 0064), lowercased, and without one leading `the`, `all`, `many`, or `most`.
 */
export function normalisedCustomer(customer: string): string {
  const key = customerKey(customer);
  const prefix = LEADING_QUANTIFIERS.find((word) => key.startsWith(word));
  return prefix === undefined ? key : key.slice(prefix.length);
}

/**
 * Whether `customer` is a generic party (REQ-PROC-009 AC4, ADR 0066): after normalisation and
 * lowercasing, and without one leading `the`, `all`, `many`, or `most`, it equals a listed term.
 * A qualified party such as `hospital IT administrators` never matches.
 */
export function isGenericCustomer(customer: string, terms: readonly string[]): boolean {
  const listed = new Set(terms.map(customerKey));
  const key = customerKey(customer);
  if (listed.has(key)) {
    return true;
  }
  const prefix = LEADING_QUANTIFIERS.find((word) => key.startsWith(word));
  return prefix !== undefined && listed.has(key.slice(prefix.length));
}

const STOP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "its",
  "many",
  "most",
  "of",
  "on",
  "or",
  "our",
  "some",
  "such",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "to",
  "with",
]);

function contentWords(text: string): Set<string> {
  const words = customerKey(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words
      .filter((word) => !STOP_WORDS.has(word))
      // A trailing plural `s` is ignored, so `bank` and `banks` share a word.
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)),
  );
}

/**
 * Report-only check of ADR 0066: `CustomerQuote` shares at least one content word with `Customer`
 * after normalisation. It never fails a candidate; the run report and eval report count it.
 */
export function customerQuoteOverlaps(customer: string, customerQuote: string): boolean {
  const quoted = contentWords(customerQuote);
  return [...contentWords(customer)].some((word) => quoted.has(word));
}

export type ExtractionCheckReason = "quote-not-found" | "generic-customer" | "instruction-quote";

/** A candidate-level check that failed (REQ-PROC-009 AC3, AC4). */
export type ExtractionItemFailure = {
  Index: number;
  Field: (typeof QUOTE_FIELDS)[number] | "Customer";
  Reason: ExtractionCheckReason;
};

/**
 * The candidate-level checks of a schema-valid output: each quote occurs in the text the step
 * sent after normalisation (ADR 0064), no quote carries an instruction planted for this
 * pipeline (ADR 0122), and `Customer` is not a generic party (ADR 0066).
 */
export function extractionItemChecks(
  output: ExtractionOutput,
  quoteText: string,
  genericCustomerTerms: readonly string[],
): ExtractionItemFailure[] {
  const failures: ExtractionItemFailure[] = [];
  output.Candidates.forEach((candidate, index) => {
    for (const field of QUOTE_FIELDS) {
      const quote = candidate[field];
      if (quote !== null && !quoteOccurs(quoteText, quote)) {
        failures.push({ Index: index, Field: field, Reason: "quote-not-found" });
      } else if (quote !== null && containsPlantedInstruction(quote)) {
        failures.push({ Index: index, Field: field, Reason: "instruction-quote" });
      }
    }
    if (isGenericCustomer(candidate.Customer, genericCustomerTerms)) {
      failures.push({ Index: index, Field: "Customer", Reason: "generic-customer" });
    }
  });
  return failures;
}

/** The retry message for one failed check, naming the candidate and field (ADR 0064). */
export function extractionFailureMessage(
  output: ExtractionOutput,
  failure: ExtractionItemFailure,
): string {
  const path = `Candidates[${failure.Index}].${failure.Field}`;
  if (failure.Reason === "generic-customer") {
    const customer = output.Candidates[failure.Index]?.Customer ?? "";
    return `${path}: "${customer}" is a generic party, not a customer that can act; name a role or organization type, or leave the candidate out`;
  }
  if (failure.Reason === "instruction-quote") {
    return `${path}: the quote is an instruction planted in the publication, not evidence; leave the candidate out`;
  }
  return `${path}: the quote is not verbatim in the text`;
}

export const ALL_CANDIDATES_FAILED_NOTE =
  "Every candidate failed its checks (a quote not in the text, a planted instruction, or a generic customer), so none is kept.";

/**
 * Applies the candidate-level checks to the output of a step (ADR 0064): a failing candidate is
 * dropped and listed in `Dropped`, the others are kept with each quote replaced by the exact span
 * of `quoteText` that matched. When none remains, `Notes` says that every candidate failed.
 */
export function applyExtractionChecks(
  output: ExtractionOutput,
  quoteText: string,
  genericCustomerTerms: readonly string[],
): { Output: ExtractionOutput; Dropped: ExtractionItemFailure[] } {
  const failures = extractionItemChecks(output, quoteText, genericCustomerTerms);
  const failed = new Set(failures.map((failure) => failure.Index));
  const kept = output.Candidates.flatMap((candidate, index) => {
    if (failed.has(index)) {
      return [];
    }
    const spans = { ...candidate };
    for (const field of QUOTE_FIELDS) {
      const quote = candidate[field];
      const span = quote === null ? null : findQuoteSpan(quoteText, quote);
      // A span longer than the contract allows (whitespace collapsed by normalisation) keeps the
      // model's quote, which matches after normalisation as well.
      if (span !== null && span.length <= 500) {
        spans[field] = span;
      }
    }
    return [spans];
  });
  const notes =
    output.Candidates.length > 0 && kept.length === 0 ? ALL_CANDIDATES_FAILED_NOTE : output.Notes;
  return { Output: { ...output, Candidates: kept, Notes: notes }, Dropped: failures };
}
