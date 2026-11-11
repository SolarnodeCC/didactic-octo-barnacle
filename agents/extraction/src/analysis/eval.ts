import {
  ProblemDiscoveryOutputSchema,
  RelevanceModelOutputSchema,
  ResearchAnalystOutputSchema,
  bestIndustries,
  repairModelOutput,
  strategicRelevanceScore,
  type ProblemDiscoveryOutput,
} from "@roi/models";

import { report, type EntryResult, type EvalReport } from "../eval.js";
import { type Threshold } from "../golden-set.js";

import {
  type ProblemDiscoveryEntry,
  type RelevanceEntry,
  type ResearchAnalystEntry,
} from "./golden-set.js";

/**
 * Evals of Research Analyst, Problem Discovery, and Relevance against their golden sets
 * (docs/kt/test/ai-evals.md, REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-006, ADR 0093). An entry
 * passes when every check passes (`entry-pass-rate`). Code checks the ranges and enums; a model
 * judge checks the required facts of Problem Discovery.
 */

/** A step under evaluation: one golden-set entry in, the raw model output out. */
export type EntryModelFn<E> = (entry: E) => Promise<unknown>;

const inRange = (value: number, [low, high]: readonly [number, number]): boolean =>
  value >= low && value <= high;

/**
 * Research Analyst: Novelty in the expected range, the expected Maturity, every required
 * industry named, and every related publication cited is one of the neighbors given.
 */
export async function runResearchAnalystEval(
  entries: readonly ResearchAnalystEntry[],
  model: EntryModelFn<ResearchAnalystEntry>,
  threshold: Threshold,
): Promise<EvalReport> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    const failures: string[] = [];
    const repaired = repairModelOutput(await model(entry), ResearchAnalystOutputSchema);
    const parsed = repaired.Ok ? ResearchAnalystOutputSchema.safeParse(repaired.Value) : null;
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      const out = parsed.data;
      if (!inRange(out.Novelty, entry.expected.noveltyRange)) {
        failures.push("novelty");
      }
      if (out.Maturity !== entry.expected.maturity) {
        failures.push("maturity");
      }
      if (entry.expected.industriesInclude.some((industry) => !out.Industry.includes(industry))) {
        failures.push("industries");
      }
      const known = new Set(entry.Neighbors.map((n) => n.Id));
      if (out.RelatedPublicationIds.some((id) => !known.has(id))) {
        failures.push("evidence:RelatedPublicationIds");
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
    });
  }
  return report(results, threshold);
}

/** The judge's verdict per required fact, in order, or why it gave none. */
export type FactVerdicts = { Ok: true; Present: boolean[] } | { Ok: false; Error: string };

/** Decides which required facts a Problem Discovery output states (OQ-020, ADR 0093). */
export type FactJudge = (input: {
  EntryId: string;
  Facts: readonly string[];
  Output: ProblemDiscoveryOutput;
}) => Promise<FactVerdicts>;

export type ProblemDiscoveryEvalReport = EvalReport & {
  /** Required facts the judge found present, over the facts of the outputs it judged. */
  FactsPresent: number;
  FactsJudged: number;
  JudgeErrors: number;
};

/**
 * Problem Discovery: the expected customer industry, a PainLevel in the expected range, and
 * every required fact present according to the judge. A judge error fails the entry.
 */
export async function runProblemDiscoveryEval(
  entries: readonly ProblemDiscoveryEntry[],
  model: EntryModelFn<ProblemDiscoveryEntry>,
  judge: FactJudge,
  threshold: Threshold,
): Promise<ProblemDiscoveryEvalReport> {
  const results: EntryResult[] = [];
  let factsPresent = 0;
  let factsJudged = 0;
  let judgeErrors = 0;
  for (const entry of entries) {
    const failures: string[] = [];
    const repaired = repairModelOutput(await model(entry), ProblemDiscoveryOutputSchema);
    const parsed = repaired.Ok ? ProblemDiscoveryOutputSchema.safeParse(repaired.Value) : null;
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      const out = parsed.data;
      if (out.Customer.Industry !== entry.expected.customerIndustry) {
        failures.push("customer-industry");
      }
      if (!inRange(out.PainLevel, entry.expected.painLevelRange)) {
        failures.push("pain-level");
      }
      const verdicts = await judge({
        EntryId: entry.id,
        Facts: entry.expected.requiredFacts,
        Output: out,
      });
      if (!verdicts.Ok || verdicts.Present.length !== entry.expected.requiredFacts.length) {
        judgeErrors += 1;
        failures.push("judge-error");
      } else {
        factsJudged += verdicts.Present.length;
        verdicts.Present.forEach((present, index) => {
          if (present) {
            factsPresent += 1;
          } else {
            failures.push(`fact:${index}`);
          }
        });
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
    });
  }
  return {
    ...report(results, threshold),
    FactsPresent: factsPresent,
    FactsJudged: factsJudged,
    JudgeErrors: judgeErrors,
  };
}

/**
 * Relevance: the expected industry among the best-fitting ones (a tie counts for each), the
 * computed StrategicRelevanceScore and TechnicalFeasibility in their ranges, and the expected
 * ImplementationEffort.
 */
export async function runRelevanceEval(
  entries: readonly RelevanceEntry[],
  model: EntryModelFn<RelevanceEntry>,
  threshold: Threshold,
): Promise<EvalReport> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    const failures: string[] = [];
    const repaired = repairModelOutput(await model(entry), RelevanceModelOutputSchema);
    const parsed = repaired.Ok ? RelevanceModelOutputSchema.safeParse(repaired.Value) : null;
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      const out = parsed.data;
      if (!bestIndustries(out).includes(entry.expected.bestIndustry)) {
        failures.push("best-industry");
      }
      if (!inRange(strategicRelevanceScore(out), entry.expected.strategicRelevanceRange)) {
        failures.push("strategic-relevance");
      }
      if (!inRange(out.TechnicalFeasibility, entry.expected.technicalFeasibilityRange)) {
        failures.push("technical-feasibility");
      }
      if (out.ImplementationEffort !== entry.expected.implementationEffort) {
        failures.push("implementation-effort");
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
    });
  }
  return report(results, threshold);
}
