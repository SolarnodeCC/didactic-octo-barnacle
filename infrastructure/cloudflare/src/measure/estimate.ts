/**
 * Cost per publication, estimated from real corpus data (ADR 0032). Phase 1 has no model
 * calls, so this is an estimate and is labelled as one; phase 2 replaces it with a
 * measurement. A price left empty is reported as missing, never guessed.
 */
export type StepAssumptions = {
  promptTokens: number;
  outputTokens: number;
  inputEurPerMillionTokens: number | null;
  outputEurPerMillionTokens: number | null;
};

export type CostAssumptions = {
  charsPerToken: number;
  dailyExtractionLimit: number;
  triage: StepAssumptions;
  extraction: StepAssumptions;
};

export type StepCost = { InputTokens: number | null; OutputTokens: number; Eur: number | null };

export type CostEstimate = {
  AvgAbstractTokens: number | null;
  PublicationsPerDay: number | null;
  Triage: StepCost;
  Extraction: StepCost;
  /** Triage plus extraction for one publication: every publication is assumed to reach extraction. */
  PerPublicationEur: number | null;
  /** All publications triaged, at most the daily limit extracted. */
  DailyUpperBoundEur: number | null;
  /** OQ-013: daily limit × cost per publication × 1.5. */
  ProvisionalPhase2BudgetEur: number | null;
  Complete: boolean;
  Missing: string[];
};

const BUDGET_MULTIPLIER = 1.5;

function numberField(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path}.${key} must be a number of at least 0`);
  }
  return value;
}

function priceField(source: Record<string, unknown>, key: string, path: string): number | null {
  const value = source[key];
  if (value === null) {
    return null;
  }
  return numberField(source, key, path);
}

function parseStep(value: unknown, path: string): StepAssumptions {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} must be an object`);
  }
  const step = value as Record<string, unknown>;
  return {
    promptTokens: numberField(step, "promptTokens", path),
    outputTokens: numberField(step, "outputTokens", path),
    inputEurPerMillionTokens: priceField(step, "inputEurPerMillionTokens", path),
    outputEurPerMillionTokens: priceField(step, "outputEurPerMillionTokens", path),
  };
}

export function parseCostAssumptions(json: unknown): CostAssumptions {
  if (typeof json !== "object" || json === null) {
    throw new Error("cost assumptions must be an object");
  }
  const root = json as Record<string, unknown>;
  const charsPerToken = numberField(root, "charsPerToken", "assumptions");
  if (charsPerToken === 0) {
    throw new Error("assumptions.charsPerToken must be above 0");
  }
  return {
    charsPerToken,
    dailyExtractionLimit: numberField(root, "dailyExtractionLimit", "assumptions"),
    triage: parseStep(root["triage"], "triage"),
    extraction: parseStep(root["extraction"], "extraction"),
  };
}

function stepCost(
  step: StepAssumptions,
  abstractTokens: number | null,
  name: string,
  missing: string[],
): StepCost {
  const inputTokens = abstractTokens === null ? null : step.promptTokens + abstractTokens;
  if (step.inputEurPerMillionTokens === null) {
    missing.push(`${name}.inputEurPerMillionTokens`);
  }
  if (step.outputEurPerMillionTokens === null) {
    missing.push(`${name}.outputEurPerMillionTokens`);
  }
  const eur =
    inputTokens === null ||
    step.inputEurPerMillionTokens === null ||
    step.outputEurPerMillionTokens === null
      ? null
      : (inputTokens * step.inputEurPerMillionTokens +
          step.outputTokens * step.outputEurPerMillionTokens) /
        1_000_000;
  return { InputTokens: inputTokens, OutputTokens: step.outputTokens, Eur: eur };
}

export function estimateCost(
  assumptions: CostAssumptions,
  corpus: { AvgAbstractChars: number | null; PublicationsPerDay: number | null },
): CostEstimate {
  const missing: string[] = [];
  const abstractTokens =
    corpus.AvgAbstractChars === null ? null : corpus.AvgAbstractChars / assumptions.charsPerToken;
  if (abstractTokens === null) {
    missing.push("abstracts (none stored yet)");
  }
  if (corpus.PublicationsPerDay === null) {
    missing.push("publications per day (no data yet)");
  }

  const triage = stepCost(assumptions.triage, abstractTokens, "triage", missing);
  const extraction = stepCost(assumptions.extraction, abstractTokens, "extraction", missing);
  const perPublication =
    triage.Eur === null || extraction.Eur === null ? null : triage.Eur + extraction.Eur;
  const perDay = corpus.PublicationsPerDay;
  const dailyUpperBound =
    triage.Eur === null || extraction.Eur === null || perDay === null
      ? null
      : perDay * triage.Eur + Math.min(perDay, assumptions.dailyExtractionLimit) * extraction.Eur;

  return {
    AvgAbstractTokens: abstractTokens,
    PublicationsPerDay: perDay,
    Triage: triage,
    Extraction: extraction,
    PerPublicationEur: perPublication,
    DailyUpperBoundEur: dailyUpperBound,
    ProvisionalPhase2BudgetEur:
      perPublication === null
        ? null
        : assumptions.dailyExtractionLimit * perPublication * BUDGET_MULTIPLIER,
    Complete: missing.length === 0,
    Missing: missing,
  };
}
