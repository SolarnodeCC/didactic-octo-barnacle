import { ProblemDiscoveryOutputSchema, cleanLatexMarkup } from "@roi/models";

import { DATA_NOT_INSTRUCTIONS, defuseTags, delimit } from "./delimiters.js";
import { industryLines } from "./industries.js";
import { type BuiltPrompt, type Sampling } from "./prompt.js";

/**
 * `problem-discovery@1`: the pain point the finding can address and who has it, from the
 * customer's point of view (docs/kt/agents/problem-discovery.md, REQ-AGENT-002, ADR 0070,
 * ADR 0093).
 */

export const PROBLEM_DISCOVERY_PROMPT_VERSION = "problem-discovery@1";

export const PROBLEM_DISCOVERY_SAMPLING: Sampling = { Temperature: 0, MaxTokens: 8192 };

export const PROBLEM_DISCOVERY_CONTRACT = ProblemDiscoveryOutputSchema;

export type ProblemDiscoveryInput = {
  Title: string;
  Abstract: string;
  Candidate: {
    Finding: string;
    EvidenceQuote: string;
    Customer: string;
    CustomerQuote: string;
    WhyNow: string | null;
    CurrentAlternative: string | null;
  };
  /** The Research Analyst output the step receives. */
  ResearchAnalyst: {
    Novelty: number;
    Maturity: string;
    Industry: readonly string[];
    Technology: readonly string[];
  };
};

export const PROBLEM_DISCOVERY_SYSTEM = [
  "You identify the pain point that a research finding can address, and who has that pain, for one candidate software opportunity.",
  "",
  "Rules:",
  "- Problem: at most 280 characters, stated from the customer's point of view: what goes wrong for them and what it costs them. Not a research question and not the method.",
  '- Customer refines the candidate\'s customer and never names a different party: Segment (at most 120 characters, for example "mid-size hospitals"), Role (at most 80 characters, the person who feels the pain), and Industry.',
  "- One output describes one problem: the candidate's.",
  "- Industry: one value from this list; other only when none of the eight applies.",
  ...industryLines(),
  "- other: none of the eight industries above.",
  "",
  "PainLevel, an integer from 1 to 5:",
  "- 1: minor inconvenience; people rarely look for a solution.",
  "- 2: recurring annoyance with cheap workarounds.",
  "- 3: measurable loss of time or money; workarounds are costly.",
  "- 4: significant cost, risk, or missed revenue; budget exists to solve it.",
  "- 5: critical: safety, compliance, or business continuity is at stake.",
  "PainRationale: at most 400 characters, naming what in the text sets the level.",
  "",
  "Business and industry fit are judged later, not here. Confidence: a number from 0 to 1 for how well the text supports your answer. Notes: at most 400 characters, or null.",
  "",
  'Answer with JSON only, exactly this shape: {"Problem": string, "Customer": {"Segment": string, "Role": string, "Industry": string}, "PainLevel": integer, "PainRationale": string, "Confidence": number, "Notes": string or null}. No other fields.',
  "",
  DATA_NOT_INSTRUCTIONS,
].join("\n");

export function buildProblemDiscoveryPrompt(input: ProblemDiscoveryInput): BuiltPrompt {
  const c = input.Candidate;
  const ra = input.ResearchAnalyst;
  const text = defuseTags(
    [
      `Title: ${cleanLatexMarkup(input.Title)}`,
      "",
      `Abstract: ${cleanLatexMarkup(input.Abstract)}`,
      "",
      `Candidate finding: ${c.Finding}`,
      `Evidence quote: ${c.EvidenceQuote}`,
      `Candidate customer: ${c.Customer}`,
      `Customer quote: ${c.CustomerQuote}`,
      `Why now: ${c.WhyNow ?? "not named"}`,
      `Current alternative: ${c.CurrentAlternative ?? "not named"}`,
      "",
      `Research Analyst: novelty ${ra.Novelty}, maturity ${ra.Maturity}, industries ${ra.Industry.join(", ")}, technologies ${ra.Technology.join(", ")}.`,
    ].join("\n"),
  );
  return {
    Prompt: { System: PROBLEM_DISCOVERY_SYSTEM, User: delimit(text) },
    QuoteText: text,
    InputMode: "abstract",
  };
}
