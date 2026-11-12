import { RelevanceModelOutputSchema } from "@roi/models";

import { DATA_NOT_INSTRUCTIONS, defuseTags, delimit } from "./delimiters.js";
import { industryLines } from "./industries.js";
import { type BuiltPrompt, type Sampling } from "./prompt.js";

/**
 * `relevance@1`: fit with each target industry, technical feasibility, and implementation
 * effort, from the earlier agents' outputs and the candidate; no publication text
 * (docs/kt/agents/relevance.md, REQ-AGENT-006, ADR 0070, ADR 0093). Code computes
 * `StrategicRelevanceScore` from `IndustryFit` and `FocusMatch`.
 *
 * `relevance@2` scores `IndustryFit` against each industry's focus areas instead of against
 * whether an organization of the industry has the problem (ADR 0097).
 */

export const RELEVANCE_PROMPT_VERSION = "relevance@2";

export const RELEVANCE_SAMPLING: Sampling = { Temperature: 0, MaxTokens: 8192 };

export const RELEVANCE_CONTRACT = RelevanceModelOutputSchema;

export type RelevanceInput = {
  Candidate: {
    Finding: string;
    Customer: string;
    WhyNow: string | null;
    WhyNowQuote: string | null;
    CurrentAlternative: string | null;
    AlternativeQuote: string | null;
  };
  ResearchAnalyst: { Maturity: string; Industry: readonly string[]; Technology: readonly string[] };
  /** The Problem Discovery output, or the facts of it that a golden-set entry holds. */
  ProblemDiscovery: { Problem: string; CustomerIndustry: string; PainLevel: string };
};

export const RELEVANCE_SYSTEM = [
  "You judge how relevant one candidate software opportunity is to eight target industries, how feasible it is technically, and how much effort an MVP takes. You read the outputs of earlier steps, not the publication.",
  "",
  "Target industries and their focus areas:",
  ...industryLines(),
  "",
  "IndustryFit: an integer from 0 to 100 for every one of the eight industries: how well the opportunity serves that industry's priorities, as its focus areas above state them.",
  "- 0-20: no link to the industry.",
  "- 20-45: organizations in the industry may have the problem, but it lies outside the industry's focus areas.",
  "- 45-70: the problem touches one of the industry's focus areas indirectly.",
  "- 70-90: the problem lies within one of the industry's focus areas.",
  "- 90-100: the problem is central to a focus area and the industry itself carries it.",
  "FocusMatch: for every one of the eight industries, none, partial, or clear: how well the opportunity matches that industry's focus areas above.",
  "",
  "TechnicalFeasibility: an integer from 0 to 100. Start from the research maturity (theoretical 0-29, lab-result 30-59, prototype 60-79, field-tested 80-100) and lower it for constraints such as missing data, regulation, or required hardware.",
  "ImplementationEffort:",
  "- S: a small team builds an MVP in under three months with existing tools.",
  "- M: an MVP takes three to six months or needs one specialist capability.",
  "- L: an MVP takes six to twelve months or needs regulated data or integrations.",
  "- XL: more than a year, new research, or certification is needed.",
  "Constraints: up to five short items (at most 200 characters each), for example regulation or data access.",
  "",
  "Do not compute a strategic relevance score; code does that from IndustryFit and FocusMatch. Confidence: a number from 0 to 1. Notes: at most 400 characters, or null; give the basis of TechnicalFeasibility there.",
  "",
  'Answer with JSON only, exactly this shape: {"IndustryFit": {"automotive": integer, "aerospace-defense": integer, "consumer-retail": integer, "energy-utilities": integer, "banking": integer, "insurance": integer, "public-sector": integer, "life-sciences": integer}, "FocusMatch": {the same eight keys: "none", "partial", or "clear"}, "TechnicalFeasibility": integer, "ImplementationEffort": string, "Constraints": [string], "Confidence": number, "Notes": string or null}. No other fields.',
  "",
  DATA_NOT_INSTRUCTIONS,
].join("\n");

export function buildRelevancePrompt(input: RelevanceInput): BuiltPrompt {
  const c = input.Candidate;
  const ra = input.ResearchAnalyst;
  const pd = input.ProblemDiscovery;
  const text = defuseTags(
    [
      `Candidate finding: ${c.Finding}`,
      `Candidate customer: ${c.Customer}`,
      c.WhyNow === null
        ? "Why now: not named"
        : `Why now: ${c.WhyNow} (quote: "${c.WhyNowQuote ?? ""}")`,
      c.CurrentAlternative === null
        ? "Current alternative: not named"
        : `Current alternative: ${c.CurrentAlternative} (quote: "${c.AlternativeQuote ?? ""}")`,
      "",
      `Research Analyst: maturity ${ra.Maturity}, industries ${ra.Industry.join(", ")}, technologies ${ra.Technology.join(", ")}.`,
      "",
      `Problem Discovery: problem: ${pd.Problem}`,
      `Customer industry: ${pd.CustomerIndustry}. Pain level: ${pd.PainLevel}.`,
    ].join("\n"),
  );
  return {
    Prompt: { System: RELEVANCE_SYSTEM, User: delimit(text) },
    QuoteText: text,
    InputMode: "abstract",
  };
}
