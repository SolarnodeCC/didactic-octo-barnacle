import { describe, expect, it } from "vitest";

import {
  AgentOutputViewSchema,
  OpportunityScoreSchema,
  ScoreModelSchema,
  scoreBand,
} from "./opportunity.js";

describe("REQ-PROC-007: the opportunity and score contracts", () => {
  it("REQ-PROC-007: AC1 maps a final score to the bands of scoring.md", () => {
    expect([0, 39, 40, 69, 70, 89, 90, 100].map(scoreBand)).toEqual([
      "Low",
      "Low",
      "Medium",
      "Medium",
      "High",
      "High",
      "Exceptional",
      "Exceptional",
    ]);
  });

  it("REQ-PROC-007: AC1 a score's band must follow its value", () => {
    const score = {
      ModelVersion: "placeholder-0",
      Categories: {
        ScientificNovelty: 60,
        MarketPotential: 76.1,
        CompetitiveGap: 50,
        TechnicalFeasibility: 80,
        StrategicRelevance: 90,
      },
      WeightedSum: 71.22,
      OpportunityScore: 71,
      Band: "High",
      Labels: ["estimate-based"],
    };
    expect(OpportunityScoreSchema.parse(score)).toEqual(score);
    expect(() => OpportunityScoreSchema.parse({ ...score, Band: "Medium" })).toThrow();
  });

  it("REQ-PROC-007: AC1 a score model's weights sum to 100", () => {
    const model = {
      Id: "sm_placeholder_0",
      Version: "placeholder-0",
      Weights: {
        ScientificNovelty: 20,
        MarketPotential: 20,
        CompetitiveGap: 20,
        TechnicalFeasibility: 20,
        StrategicRelevance: 20,
      },
      DerivationRuleVersion: "placeholder-0",
      Active: false,
    };
    expect(ScoreModelSchema.parse(model)).toEqual(model);
    expect(() =>
      ScoreModelSchema.parse({ ...model, Weights: { ...model.Weights, CompetitiveGap: 10 } }),
    ).toThrow();
  });

  it("REQ-PROC-007: AC4 an agent output view is checked against its step's contract", () => {
    const view = {
      Step: "competition",
      Agent: "Competition",
      Model: "stub",
      PromptVersion: "example",
      Output: {
        Competitors: [],
        Saturation: 3,
        Gap: "No tool plans focus time.",
        GapStrength: 3,
        Differentiation: "Plans focus time.",
        Confidence: 0.5,
        Notes: null,
      },
      Evidence: [],
    };
    expect(() => AgentOutputViewSchema.parse(view)).not.toThrow();
    expect(() =>
      AgentOutputViewSchema.parse({ ...view, Output: { ...view.Output, Saturation: 9 } }),
    ).toThrow(/not a valid competition output/);
  });
});
