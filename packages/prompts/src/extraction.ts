import {
  ABSTRACT_CONFIDENCE_CAP,
  DEFAULT_MAX_CANDIDATES,
  extractionOutputSchema,
} from "@roi/models";

import { DATA_NOT_INSTRUCTIONS, defuseTags, delimit } from "./delimiters.js";
import { type BuiltPrompt, type Sampling } from "./prompt.js";

/**
 * `extraction@2`: one triaged publication in, zero or more candidate opportunities out, each
 * with a quoted problem and a quoted customer (docs/kt/agents/opportunity-extraction.md,
 * REQ-PROC-004, REQ-PROC-009, ADR 0036, ADR 0050).
 *
 * `extraction@2` has the text of `extraction@1` and a larger output budget, for the reasoning
 * that comes before the answer (ADR 0076).
 */

export const EXTRACTION_PROMPT_VERSION = "extraction@2";

export const EXTRACTION_SAMPLING: Sampling = { Temperature: 0, MaxTokens: 8192 };

/** `extraction.full_text_max_chars` (docs/kt/architecture/defaults.md). */
export const DEFAULT_FULL_TEXT_MAX_CHARS = 24_000;

/** The eight target industries of docs/kt/overview.md (ADR 0037). */
export const TARGET_INDUSTRIES = [
  "automotive",
  "aerospace and defense",
  "consumer products and retail",
  "energy and utilities",
  "banking",
  "insurance",
  "public sector",
  "life sciences",
] as const;

export function extractionContract(maxCandidates: number = DEFAULT_MAX_CANDIDATES) {
  return extractionOutputSchema(maxCandidates);
}

export type ExtractionInput = {
  Title: string;
  Abstract: string;
  /** Extracted full text when the document has `text-extracted`, otherwise null. */
  FullText: string | null;
  MaxCandidates?: number;
  FullTextMaxChars?: number;
};

export function extractionSystem(maxCandidates: number): string {
  return [
    "You find candidate software opportunities in one research publication. A candidate is a problem that a named customer has, stated and quotable from the publication text.",
    "",
    "Rules:",
    `- Return at most ${maxCandidates} candidates. One distinct problem is one candidate.`,
    "- Finding: the problem in one sentence (at most 280 characters).",
    "- EvidenceQuote: a verbatim quote from the publication that states the problem (at most 500 characters).",
    '- Customer: the role or organization type that has the problem (at most 120 characters). A generic or implied party such as "users", "people", or the researchers themselves does not count.',
    "- CustomerQuote: a verbatim quote that names the customer (at most 500 characters).",
    "- Leave out any candidate for which you cannot quote both the problem and the customer.",
    "- A burden that belongs to a population or a sector as a whole, with no named customer that could adopt a product against it, yields no candidate. A named party that can act, such as a hospital or a bank's risk team, does.",
    "- WhyNow and WhyNowQuote: set both only when the text names why the problem is pressing now; otherwise both null. Never infer them.",
    "- CurrentAlternative and AlternativeQuote: set both only when the text names what the customer does today; otherwise both null. Never infer them.",
    "- Every quote must be copied character for character from inside the publication tags: no paraphrase, no ellipsis, no added words.",
    "- Do not score, size markets, name competitors, or propose a product.",
    `- Target industries: ${TARGET_INDUSTRIES.join(", ")}.`,
    "",
    `Confidence: a number from 0 to 1 for how well the text supports your answer. When you read only the abstract, it is at most ${ABSTRACT_CONFIDENCE_CAP}. When you cannot answer from the text, set it at or below 0.2 and say why in Notes.`,
    "Notes: at most 400 characters, or null. When Candidates is empty, Notes must say why: for example no quotable problem, no named customer, no party that can act on the burden, or out of industry scope.",
    "",
    'Answer with JSON only, exactly this shape: {"Candidates": [{"Finding", "EvidenceQuote", "Customer", "CustomerQuote", "WhyNow", "WhyNowQuote", "CurrentAlternative", "AlternativeQuote"}], "Confidence": number, "Notes": string or null}.',
    "",
    DATA_NOT_INSTRUCTIONS,
  ].join("\n");
}

export function buildExtractionPrompt(input: ExtractionInput): BuiltPrompt {
  const maxCandidates = input.MaxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const maxChars = input.FullTextMaxChars ?? DEFAULT_FULL_TEXT_MAX_CHARS;
  const fullText = input.FullText?.trim() ?? "";
  const inputMode = fullText === "" ? "abstract" : "full-text";
  // Full text is cut before the call; the quote check uses exactly the text that was sent.
  const body =
    inputMode === "full-text"
      ? `Full text:\n${fullText.slice(0, maxChars)}`
      : `Abstract: ${input.Abstract}`;
  const text = defuseTags(`Title: ${input.Title}\n\n${body}`);
  return {
    Prompt: {
      System: extractionSystem(maxCandidates),
      User: `Input: ${inputMode === "full-text" ? "full text" : "abstract only"}.\n${delimit(text)}`,
    },
    QuoteText: text,
    InputMode: inputMode,
  };
}
