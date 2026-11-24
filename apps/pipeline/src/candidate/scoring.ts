import {
  CompetitionOutputSchema,
  MarketAnalysisOutputSchema,
  ProblemDiscoveryOutputSchema,
  RelevanceModelOutputSchema,
  ResearchAnalystOutputSchema,
  scoreBand,
  strategicRelevanceScore,
  type AgentStepName,
  type ScoreBand,
  type ScoreCategories,
} from "@roi/models";

/**
 * Scoring of the thin slice (REQ-PROC-007 AC1, ADR 0116). The score model `placeholder-0` uses
 * the derivation rules of ADR 0005 with equal weights; phase 4 adds score model version 1 with
 * the weights of scoring.md (REQ-SCORE-001).
 */

export const CATEGORY_KEYS = [
  "ScientificNovelty",
  "MarketPotential",
  "CompetitiveGap",
  "TechnicalFeasibility",
  "StrategicRelevance",
] as const satisfies ReadonlyArray<keyof ScoreCategories>;

/** `lin(x, a, b)` of ADR 0005: x mapped linearly from a..b to 0..100, clamped. */
export function lin(x: number, a: number, b: number): number {
  return Math.min(100, Math.max(0, ((x - a) / (b - a)) * 100));
}

/** Rounded to one decimal, as the categories are shown. */
function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export type Derivation =
  | {
      Ok: true;
      Categories: ScoreCategories;
      /** The agent fields each category read (REQ-SCORE-004). */
      Explanation: Record<keyof ScoreCategories, string[]>;
      EstimateBased: boolean;
    }
  | { Ok: false; Reason: string };

/**
 * The five categories from the agent outputs (ADR 0005). A category that cannot be derived, a
 * missing output or a SAM of zero or in a currency without a rate, gives no score: the
 * opportunity stays incomplete (scoring.md, REQ-SCORE-005).
 */
export function deriveCategories(
  outputs: Partial<Record<AgentStepName, unknown>>,
  eurRates: Record<string, number>,
): Derivation {
  const research = ResearchAnalystOutputSchema.safeParse(outputs.research_analyst);
  const problem = ProblemDiscoveryOutputSchema.safeParse(outputs.problem_discovery);
  const market = MarketAnalysisOutputSchema.safeParse(outputs.market_analysis);
  const competition = CompetitionOutputSchema.safeParse(outputs.competition);
  const relevance = RelevanceModelOutputSchema.safeParse(outputs.relevance);
  if (
    !research.success ||
    !problem.success ||
    !market.success ||
    !competition.success ||
    !relevance.success
  ) {
    return { Ok: false, Reason: "an agent output that a category reads is missing or invalid" };
  }
  const sam = market.data.SAM;
  const rate = eurRates[sam.Low.Currency];
  if (rate === undefined || sam.Low.Amount <= 0 || sam.High.Amount <= 0) {
    return { Ok: false, Reason: "the SAM cannot be converted to a positive amount in EUR" };
  }
  const samEur = Math.sqrt(sam.Low.Amount * rate * (sam.High.Amount * rate));
  const categories: ScoreCategories = {
    ScientificNovelty: research.data.Novelty,
    MarketPotential: tenth(
      0.6 * lin(Math.log10(samEur), 6, 10) +
        0.2 * lin(market.data.GrowthRate.CagrPercent, 0, 30) +
        0.2 * lin(problem.data.PainLevel, 1, 5),
    ),
    CompetitiveGap: tenth(
      0.5 * lin(6 - competition.data.Saturation, 1, 5) +
        0.5 * lin(competition.data.GapStrength, 1, 5),
    ),
    TechnicalFeasibility: relevance.data.TechnicalFeasibility,
    StrategicRelevance: strategicRelevanceScore(relevance.data),
  };
  return {
    Ok: true,
    Categories: categories,
    Explanation: {
      ScientificNovelty: ["ResearchAnalyst.Novelty"],
      MarketPotential: [
        "MarketAnalysis.SAM",
        "MarketAnalysis.GrowthRate.CagrPercent",
        "ProblemDiscovery.PainLevel",
      ],
      CompetitiveGap: ["Competition.Saturation", "Competition.GapStrength"],
      TechnicalFeasibility: ["Relevance.TechnicalFeasibility"],
      StrategicRelevance: ["Relevance.IndustryFit", "Relevance.FocusMatch"],
    },
    // Estimated market figures are not penalised; the score is labelled instead (ADR 0005).
    EstimateBased: [market.data.TAM, market.data.SAM, market.data.GrowthRate].some(
      (figure) => figure.Basis === "estimated",
    ),
  };
}

export type WeightedScore = { WeightedSum: number; FinalScore: number; Band: ScoreBand };

/**
 * The weighted sum in integer basis points, so rounding half up is exact: a weighted sum of 69.5
 * is 70 (ADR 0005). Weights are whole percentages that sum to 100.
 */
export function weightedScore(
  categories: ScoreCategories,
  weights: Record<string, number>,
): WeightedScore {
  let total = 0;
  for (const key of CATEGORY_KEYS) {
    total += Math.round(categories[key] * 100) * Math.round(weights[key] ?? 0);
  }
  const finalScore = Math.floor((total + 5_000) / 10_000);
  return { WeightedSum: total / 10_000, FinalScore: finalScore, Band: scoreBand(finalScore) };
}
