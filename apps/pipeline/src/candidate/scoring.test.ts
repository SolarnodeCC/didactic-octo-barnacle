import { describe, expect, it } from "vitest";

import { deriveCategories, lin, weightedScore } from "./scoring.js";
import { STUB_STEPS } from "./steps.js";
import { STUB_OUTPUTS } from "./stub-outputs.js";

const EQUAL = {
  ScientificNovelty: 20,
  MarketPotential: 20,
  CompetitiveGap: 20,
  TechnicalFeasibility: 20,
  StrategicRelevance: 20,
};

/** The example's outputs by step name, without their evidence. */
function exampleOutputs(): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(STUB_STEPS).map((step) => {
      const { Evidence: _evidence, ...output } = STUB_OUTPUTS[step.Agent] ?? {};
      return [step.Name, output];
    }),
  );
}

describe("REQ-PROC-007: the placeholder score model placeholder-0", () => {
  it("REQ-PROC-007: AC1 derives the example's categories with the rules of ADR 0005", () => {
    const derived = deriveCategories(exampleOutputs(), { EUR: 1 });
    expect(derived).toMatchObject({
      Ok: true,
      Categories: {
        ScientificNovelty: 60,
        MarketPotential: 76.1,
        CompetitiveGap: 50,
        TechnicalFeasibility: 80,
        StrategicRelevance: 90,
      },
      EstimateBased: true,
    });
  });

  it("REQ-PROC-007: AC1 scores the example 71, High, with equal weights", () => {
    const derived = deriveCategories(exampleOutputs(), { EUR: 1 });
    if (!derived.Ok) {
      throw new Error(derived.Reason);
    }
    expect(weightedScore(derived.Categories, EQUAL)).toEqual({
      WeightedSum: 71.22,
      FinalScore: 71,
      Band: "High",
    });
  });

  it("REQ-PROC-007: AC1 rounds half up in basis points, so 69.5 is 70", () => {
    const categories = {
      ScientificNovelty: 69.5,
      MarketPotential: 69.5,
      CompetitiveGap: 69.5,
      TechnicalFeasibility: 69.5,
      StrategicRelevance: 69.5,
    };
    expect(weightedScore(categories, EQUAL)).toEqual({
      WeightedSum: 69.5,
      FinalScore: 70,
      Band: "High",
    });
    expect(lin(15, 0, 30)).toBe(50);
    expect(lin(-1, 0, 30)).toBe(0);
    expect(lin(99, 0, 30)).toBe(100);
  });

  it("REQ-PROC-007: AC1 a category that cannot be derived gives no score", () => {
    const { market_analysis: _market, ...withoutMarket } = exampleOutputs();
    expect(deriveCategories(withoutMarket, { EUR: 1 })).toMatchObject({ Ok: false });
    // A SAM in a currency the score model has no rate for cannot be converted.
    expect(deriveCategories(exampleOutputs(), { USD: 1 })).toMatchObject({ Ok: false });
  });
});
