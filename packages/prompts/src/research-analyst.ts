import { ResearchAnalystOutputSchema, cleanLatexMarkup } from "@roi/models";

import { DATA_NOT_INSTRUCTIONS, defuseTags, delimit } from "./delimiters.js";
import { industryLines } from "./industries.js";
import { type BuiltPrompt, type Sampling } from "./prompt.js";

/**
 * `research-analyst@1`: what the publication found, how mature it is, how novel it is against
 * the nearest publications of the corpus, and which industries and technologies it involves
 * (docs/kt/agents/research-analyst.md, REQ-AGENT-001, ADR 0093). The output budget leaves room
 * for the reasoning of reasoning models (ADR 0076).
 *
 * `research-analyst@2` adds the owner's rule that care providers and cross-industry software are
 * `other` (ADR 0100).
 */

export const RESEARCH_ANALYST_PROMPT_VERSION = "research-analyst@2";

export const RESEARCH_ANALYST_SAMPLING: Sampling = { Temperature: 0, MaxTokens: 8192 };

export const RESEARCH_ANALYST_CONTRACT = ResearchAnalystOutputSchema;

export type RelatedPublication = { Id: string; Title: string; Abstract: string; Published: string };

export type ResearchAnalystInput = {
  Title: string;
  Abstract: string;
  /** The candidate opportunity from extraction. */
  Finding: string;
  Customer: string;
  /** The nearest publications from semantic search (REQ-PROC-003), at most ten. */
  Related: readonly RelatedPublication[];
};

export const RESEARCH_ANALYST_SYSTEM = [
  "You analyse one research publication for a candidate software opportunity: what it found, how mature the result is, how novel it is against related publications, and which industries and technologies it involves.",
  "",
  "Novelty, an integer from 0 to 100, judged against the related publications given:",
  "- 0-19: repeats known results; the related publications report the same finding.",
  "- 20-49: incremental; a known method applied to a new setting or with better numbers.",
  "- 50-79: a new method or a clearly new finding for this field.",
  "- 80-100: a new direction with few or no comparable publications.",
  "NoveltyRationale: at most 600 characters, naming what is new or what repeats.",
  "RelatedPublicationIds: the IDs of the related publications you compared against, copied exactly from the input; at most 10. Leave it empty only when none of them is comparable, and say so in Notes.",
  "",
  "Maturity, the most advanced stage the text reports:",
  "- theoretical: analysis, a model, a framework, or a proposal with nothing built or run.",
  "- lab-result: experiments on datasets, benchmarks, or simulations.",
  "- prototype: a working system built and demonstrated, or piloted on realistic data or with a few users.",
  "- field-tested: used in real operation, or evaluated with its intended users in their own setting.",
  "",
  "Industry: one to four values, most relevant first, from this list. Use other only when none of the eight applies.",
  "Care providers (hospitals, clinics, nurses, health systems) and software that serves organizations of every industry alike are other.",
  ...industryLines(),
  "- other: none of the eight industries above.",
  "Technology: one to five short names (at most 60 characters each) of the technologies the work uses or builds.",
  "",
  "Confidence: a number from 0 to 1 for how well the text supports your answer. Notes: at most 400 characters, or null.",
  "",
  'Answer with JSON only, exactly this shape: {"Novelty": integer, "NoveltyRationale": string, "RelatedPublicationIds": [string], "Maturity": string, "Industry": [string], "Technology": [string], "Confidence": number, "Notes": string or null}. No other fields.',
  "",
  DATA_NOT_INSTRUCTIONS,
].join("\n");

export function buildResearchAnalystPrompt(input: ResearchAnalystInput): BuiltPrompt {
  const related = input.Related.map(
    (item, index) =>
      `[${index + 1}] ID: ${item.Id}\nPublished: ${item.Published}\nTitle: ${cleanLatexMarkup(item.Title)}\nAbstract: ${cleanLatexMarkup(item.Abstract)}`,
  );
  const text = defuseTags(
    [
      `Title: ${cleanLatexMarkup(input.Title)}`,
      "",
      `Abstract: ${cleanLatexMarkup(input.Abstract)}`,
      "",
      `Candidate finding: ${input.Finding}`,
      `Candidate customer: ${input.Customer}`,
      "",
      related.length === 0
        ? "Related publications: none found."
        : `Related publications:\n\n${related.join("\n\n")}`,
    ].join("\n"),
  );
  return {
    Prompt: { System: RESEARCH_ANALYST_SYSTEM, User: delimit(text) },
    QuoteText: text,
    InputMode: "abstract",
  };
}
