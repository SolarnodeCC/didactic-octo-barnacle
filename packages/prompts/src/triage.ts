import { TriageModelOutputSchema } from "@roi/models";

import { DATA_NOT_INSTRUCTIONS, defuseTags, delimit } from "./delimiters.js";
import { type BuiltPrompt, type Sampling } from "./prompt.js";

/**
 * `triage@2`: the model reads five signals from the title and abstract; code scores and
 * decides (docs/kt/agents/triage.md, REQ-PROC-008, ADR 0036). The signal table is the one in
 * the agent document, word for word where it defines a signal.
 *
 * `triage@2` has the text of `triage@1` and a larger output budget: reasoning models spend
 * their tokens on reasoning before the answer, and 1024 tokens ended every round-one sample
 * call before any JSON (ADR 0076).
 */

export const TRIAGE_PROMPT_VERSION = "triage@2";

export const TRIAGE_SAMPLING: Sampling = { Temperature: 0, MaxTokens: 8192 };

export const TRIAGE_CONTRACT = TriageModelOutputSchema;

export type TriageInput = { Title: string; Abstract: string };

const SIGNALS = [
  [
    "NamedParty",
    'A role or organization type is named as having the problem, for example "governments", "regulatory bodies", or "clinicians".',
    'A generic or implied party ("users", "people", "teams" without context), or the researchers themselves.',
  ],
  [
    "StatedHarm",
    "The text states a cost, delay, loss, or risk that the party carries. A number is a plus and not required.",
    'A quality gain of a method on a benchmark, or "hinders research".',
  ],
  [
    "Trigger",
    "The text names why the problem is pressing now: a new regulation, a technology change, a changed budget or behavior.",
    '"Growing interest" or "recent advances".',
  ],
  [
    "ExistingAlternative",
    "The text names what the party does today instead: a tool, a manual process, or a practice.",
    "Baselines that are only other research methods.",
  ],
  [
    "Adoptable",
    "The work offers something an organization could adopt, such as a system, protocol, or tool.",
    "Only knowledge, a proof, or a dataset or benchmark for research. A contribution that the text itself calls conceptual (a conceptual architecture, blueprint, or proposal) with nothing built or demonstrated.",
  ],
] as const;

export const TRIAGE_SYSTEM = [
  "You screen a research publication for signs of a software opportunity. Read five yes/no signals from the title and abstract only.",
  "",
  "Signals (true only when the text itself supports it; when in doubt, false):",
  ...SIGNALS.map(
    ([name, trueWhen, notCounting]) =>
      `- ${name}: true when ${trueWhen} Does not count: ${notCounting}`,
  ),
  "",
  "Do not score the publication and do not decide whether it is accepted; code does that from your signals.",
  'Answer with JSON only, exactly this shape: {"Signals": {"NamedParty": bool, "StatedHarm": bool, "Trigger": bool, "ExistingAlternative": bool, "Adoptable": bool}, "Notes": string or null}.',
  "Notes: at most 200 characters, one sentence naming the deciding signals. No other fields.",
  "",
  DATA_NOT_INSTRUCTIONS,
].join("\n");

export function buildTriagePrompt(input: TriageInput): BuiltPrompt {
  const text = defuseTags(`Title: ${input.Title}\n\nAbstract: ${input.Abstract}`);
  return {
    Prompt: { System: TRIAGE_SYSTEM, User: delimit(text) },
    QuoteText: text,
    InputMode: "abstract",
  };
}
