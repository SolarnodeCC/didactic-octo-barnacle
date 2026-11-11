import { z } from "zod";

import { IndustrySchema } from "./agent-contract.js";

/**
 * Output contracts of the three analysis agents that are benchmarked before phase 3
 * (docs/kt/agents/research-analyst.md, problem-discovery.md, relevance.md; REQ-AGENT-001,
 * REQ-AGENT-002, REQ-AGENT-006; ADR 0093). The model fills only these; the pipeline fills the
 * envelope and the evidence items (docs/kt/agents/contract-conventions.md).
 */

/** The eight target industries (ADR 0037), the keys of the Relevance maps. `other` has no score. */
export const TargetIndustrySchema = IndustrySchema.exclude(["other"]);
export type TargetIndustry = z.infer<typeof TargetIndustrySchema>;
export const TARGET_INDUSTRY_KEYS = TargetIndustrySchema.options;

const Score = z.number().int().min(0).max(100);
const Confidence = z.number().min(0).max(1);
const Notes = z.string().max(400).nullable();

export const MaturitySchema = z.enum(["theoretical", "lab-result", "prototype", "field-tested"]);
export type Maturity = z.infer<typeof MaturitySchema>;

/** Research Analyst (REQ-AGENT-001). `RelatedPublicationIds` are the compared neighbors. */
export const ResearchAnalystOutputSchema = z
  .object({
    Novelty: Score,
    NoveltyRationale: z.string().min(1).max(600),
    RelatedPublicationIds: z.array(z.string().min(1)).max(10),
    Maturity: MaturitySchema,
    Industry: z.array(IndustrySchema).min(1).max(4),
    Technology: z.array(z.string().min(1).max(60)).min(1).max(5),
    Confidence,
    Notes,
  })
  .strict();
export type ResearchAnalystOutput = z.infer<typeof ResearchAnalystOutputSchema>;

/** Problem Discovery (REQ-AGENT-002). `Customer` refines the extraction customer (ADR 0070). */
export const ProblemDiscoveryOutputSchema = z
  .object({
    Problem: z.string().min(1).max(280),
    Customer: z
      .object({
        Segment: z.string().min(1).max(120),
        Role: z.string().min(1).max(80),
        Industry: IndustrySchema,
      })
      .strict(),
    PainLevel: z.number().int().min(1).max(5),
    PainRationale: z.string().min(1).max(400),
    Confidence,
    Notes,
  })
  .strict();
export type ProblemDiscoveryOutput = z.infer<typeof ProblemDiscoveryOutputSchema>;

export const FocusMatchSchema = z.enum(["none", "partial", "clear"]);
export type FocusMatch = z.infer<typeof FocusMatchSchema>;
export const ImplementationEffortSchema = z.enum(["S", "M", "L", "XL"]);
export type ImplementationEffort = z.infer<typeof ImplementationEffortSchema>;

function everyIndustry<T extends z.ZodType>(value: T) {
  return z
    .object(
      Object.fromEntries(TARGET_INDUSTRY_KEYS.map((key) => [key, value])) as Record<
        TargetIndustry,
        T
      >,
    )
    .strict();
}

/**
 * What the Relevance model returns (REQ-AGENT-006). Strict: `StrategicRelevanceScore` is not
 * part of it, because code computes it from `IndustryFit` and `FocusMatch`.
 */
export const RelevanceModelOutputSchema = z
  .object({
    IndustryFit: everyIndustry(Score),
    FocusMatch: everyIndustry(FocusMatchSchema),
    TechnicalFeasibility: Score,
    ImplementationEffort: ImplementationEffortSchema,
    Constraints: z.array(z.string().min(1).max(200)).max(5),
    Confidence,
    Notes,
  })
  .strict();
export type RelevanceModelOutput = z.infer<typeof RelevanceModelOutputSchema>;

const FOCUS_BONUS: Record<FocusMatch, number> = { none: 0, partial: 5, clear: 10 };

/** The industries with the highest `IndustryFit`; more than one on a tie. */
export function bestIndustries(
  output: Pick<RelevanceModelOutput, "IndustryFit">,
): TargetIndustry[] {
  const top = Math.max(...TARGET_INDUSTRY_KEYS.map((key) => output.IndustryFit[key]));
  return TARGET_INDUSTRY_KEYS.filter((key) => output.IndustryFit[key] === top);
}

/**
 * `StrategicRelevanceScore` (docs/kt/agents/relevance.md): the highest `IndustryFit`, raised
 * by 5 when that industry's `FocusMatch` is `partial` and by 10 when it is `clear`, at most
 * 100. On a tie for the highest fit, the industry with the larger raise counts (ADR 0093).
 */
export function strategicRelevanceScore(
  output: Pick<RelevanceModelOutput, "IndustryFit" | "FocusMatch">,
): number {
  const best = bestIndustries(output);
  const bonus = Math.max(...best.map((key) => FOCUS_BONUS[output.FocusMatch[key]]));
  return Math.min(100, output.IndustryFit[best[0]!] + bonus);
}
