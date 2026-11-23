import { BUDGET_CURRENCY, estimateCost, type Money, type PriceTable } from "@roi/models";

import { type SqlDatabase } from "../store/sql.js";

/** The model steps the daily budget is made of (ADR 0059). */
export type BudgetStep = "triage" | "extraction" | "embedding";

/**
 * What the budget estimates a step's cost from before it has a measured cost (ADR 0032,
 * ADR 0059). Triage and extraction use the benchmark cost per item of the configured model;
 * extraction adds the full-text input beyond the abstract; embedding is priced from its tokens.
 */
export type BudgetEstimate = {
  /** Benchmark round two, Gemma with thinking off: USD 0.0240 over 274 items (ADR 0088). */
  TriageUsdPerItem: number;
  /** Benchmark round three, `extraction@4` on abstracts: USD 0.2743 over 117 items (ADR 0091). */
  ExtractionUsdPerItem: number;
  /** The mean abstract of the phase 1 measurement, in tokens (ingestion scope). */
  MeanAbstractTokens: number;
  /** Characters per token, as in `cost-assumptions.json`. */
  CharsPerToken: number;
  /** Tokens of one embedding input: the mean abstract plus a title. */
  EmbeddingInputTokens: number;
};

/** The inputs of the ADR 0059 formula for one environment. */
export type BudgetInputs = {
  /** `budget.expected_daily_triaged`: the largest measured day until a steady state is known. */
  ExpectedDailyTriaged: number;
  /** `ingestion.daily_extraction_limit`. */
  DailyExtractionLimit: number;
  /** `budget.expected_daily_embeddings`. */
  ExpectedDailyEmbeddings: number;
  /** `budget.phase2_multiplier`. */
  Multiplier: number;
};

/** A step's cost per item in euro, and whether it was measured or estimated. */
export type StepCost = { Amount: number; Source: "measured" | "estimated" };

export type StepCosts = Record<BudgetStep, StepCost>;

/** The day's limit with the parts it was computed from, for the log. */
export type DailyBudgetResult = {
  Limit: Money;
  Parts: Record<BudgetStep, number>;
  Costs: StepCosts;
};

/** Rounded to 1e-8 euro, as costs are recorded (model-calls.md). */
function round(amount: number): number {
  return Math.round(amount * 1e8) / 1e8;
}

/**
 * The ADR 0059 formula: (expected daily triage calls × triage cost + daily extraction limit ×
 * extraction cost + expected daily embeddings × embedding cost) × multiplier (REQ-NFR-005 AC1).
 */
export function dailyBudget(inputs: BudgetInputs, costs: StepCosts): DailyBudgetResult {
  const parts = {
    triage: round(inputs.ExpectedDailyTriaged * costs.triage.Amount),
    extraction: round(inputs.DailyExtractionLimit * costs.extraction.Amount),
    embedding: round(inputs.ExpectedDailyEmbeddings * costs.embedding.Amount),
  };
  const amount = round((parts.triage + parts.extraction + parts.embedding) * inputs.Multiplier);
  return { Limit: { Amount: amount, Currency: BUDGET_CURRENCY }, Parts: parts, Costs: costs };
}

/** The models each step runs on; every one needs a price in the table. */
export type BudgetModels = Record<BudgetStep, string>;

/**
 * The estimated cost per item of each step in euro. A model with no price in the table throws,
 * so the budget is never computed from a guess (ADR 0032, ADR 0059).
 */
export function estimatedCosts(
  estimate: BudgetEstimate,
  prices: PriceTable,
  models: BudgetModels,
  fullTextMaxChars: number,
): StepCosts {
  for (const model of Object.values(models)) {
    if (prices.Models[model] === undefined) {
      throw new Error(`no price for ${model} in price table ${prices.Version}`);
    }
  }
  const usdToEur = (usd: number) => round(usd / prices.UsdPerEur);
  // ADR 0059: the extraction input is priced at the full-text cut, beyond the abstract the
  // benchmark already paid for.
  const extraTokens = Math.max(
    0,
    Math.ceil(fullTextMaxChars / estimate.CharsPerToken) - estimate.MeanAbstractTokens,
  );
  const extra = estimateCost(prices, models.extraction, {
    InputTokens: extraTokens,
    OutputTokens: 0,
  }) as Money;
  const embedding = estimateCost(prices, models.embedding, {
    InputTokens: estimate.EmbeddingInputTokens,
    OutputTokens: 0,
  }) as Money;
  return {
    triage: { Amount: usdToEur(estimate.TriageUsdPerItem), Source: "estimated" },
    extraction: {
      Amount: round(usdToEur(estimate.ExtractionUsdPerItem) + extra.Amount),
      Source: "estimated",
    },
    embedding: { Amount: embedding.Amount, Source: "estimated" },
  };
}

/** How many days of calls the measured cost looks back, and how many items it needs. */
export type MeasuredCostWindow = { Days: number; MinItems: number };

function dayStart(day: string, offsetDays: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

/**
 * The measured cost per item of a step over the complete days before `day`: the cost of all its
 * calls, retries included, divided by the items they served. Triage and extraction count
 * distinct publications; embedding counts the `embedding` rows written, since one call embeds
 * a batch. Null while fewer than `MinItems` items are behind it (ADR 0032: the first measured
 * cost replaces the estimate).
 */
export async function measuredCostPerItem(
  db: SqlDatabase,
  step: BudgetStep,
  day: string,
  window: MeasuredCostWindow,
): Promise<number | null> {
  const from = dayStart(day, -window.Days);
  const to = dayStart(day, 0);
  const cost = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_amount), 0) AS cost, COUNT(DISTINCT publication_id) AS items
       FROM model_call WHERE step_name = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(step, from, to)
    .first<{ cost: number; items: number }>();
  let items = cost?.items ?? 0;
  if (step === "embedding") {
    const rows = await db
      .prepare("SELECT COUNT(*) AS items FROM embedding WHERE created_at >= ? AND created_at < ?")
      .bind(from, to)
      .first<{ items: number }>();
    items = rows?.items ?? 0;
  }
  if (items < window.MinItems || items === 0) {
    return null;
  }
  return round((cost?.cost ?? 0) / items);
}

/** The measured cost of each step where there is one, otherwise the estimate. */
export async function stepCosts(
  db: SqlDatabase,
  day: string,
  estimated: StepCosts,
  window: MeasuredCostWindow,
): Promise<StepCosts> {
  const result = { ...estimated };
  for (const step of ["triage", "extraction", "embedding"] as const) {
    const measured = await measuredCostPerItem(db, step, day, window);
    if (measured !== null) {
      result[step] = { Amount: measured, Source: "measured" };
    }
  }
  return result;
}

/** Computes the limit of a day the first time it is needed (`createModelUsageStore`). */
export type DailyLimit = (day: string) => Promise<Money>;

/**
 * The daily limit of an environment: the ADR 0059 formula over the measured or estimated cost
 * of each step, computed once per day and logged with its parts.
 */
export function formulaDailyLimit(options: {
  Db: SqlDatabase;
  Inputs: BudgetInputs;
  Estimated: StepCosts;
  Window: MeasuredCostWindow;
  Log?: (event: string, fields: Record<string, unknown>) => void;
}): DailyLimit {
  return async (day) => {
    const costs = await stepCosts(options.Db, day, options.Estimated, options.Window);
    const result = dailyBudget(options.Inputs, costs);
    options.Log?.("budget.limit", {
      day,
      limit: result.Limit.Amount,
      triage: result.Parts.triage,
      extraction: result.Parts.extraction,
      embedding: result.Parts.embedding,
      triageCost: costs.triage.Source,
      extractionCost: costs.extraction.Source,
      embeddingCost: costs.embedding.Source,
    });
    return result.Limit;
  };
}
