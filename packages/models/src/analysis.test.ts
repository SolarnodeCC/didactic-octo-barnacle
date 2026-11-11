import { describe, expect, it } from "vitest";

import {
  ProblemDiscoveryOutputSchema,
  RelevanceModelOutputSchema,
  ResearchAnalystOutputSchema,
  TARGET_INDUSTRY_KEYS,
  bestIndustries,
  strategicRelevanceScore,
  type FocusMatch,
  type RelevanceModelOutput,
} from "./analysis.js";

const fits = (top: number, others = 10): RelevanceModelOutput["IndustryFit"] =>
  Object.fromEntries(
    TARGET_INDUSTRY_KEYS.map((key) => [key, key === "banking" ? top : others]),
  ) as RelevanceModelOutput["IndustryFit"];

const focus = (value: FocusMatch): RelevanceModelOutput["FocusMatch"] =>
  Object.fromEntries(
    TARGET_INDUSTRY_KEYS.map((key) => [key, value]),
  ) as RelevanceModelOutput["FocusMatch"];

const relevance: RelevanceModelOutput = {
  IndustryFit: fits(70),
  FocusMatch: focus("none"),
  TechnicalFeasibility: 60,
  ImplementationEffort: "M",
  Constraints: ["regulated data"],
  Confidence: 0.6,
  Notes: null,
};

describe("REQ-AGENT-001: the Research Analyst contract", () => {
  const valid = {
    Novelty: 55,
    NoveltyRationale: "A new method for this field.",
    RelatedPublicationIds: ["http://arxiv.org/abs/2510.27493v2"],
    Maturity: "prototype",
    Industry: ["public-sector"],
    Technology: ["causal analysis"],
    Confidence: 0.5,
    Notes: null,
  };

  it("REQ-AGENT-001: a valid output parses and an unknown field or a bad enum fails", () => {
    expect(ResearchAnalystOutputSchema.safeParse(valid).success).toBe(true);
    expect(ResearchAnalystOutputSchema.safeParse({ ...valid, Score: 3 }).success).toBe(false);
    expect(ResearchAnalystOutputSchema.safeParse({ ...valid, Maturity: "idea" }).success).toBe(
      false,
    );
    expect(ResearchAnalystOutputSchema.safeParse({ ...valid, Industry: [] }).success).toBe(false);
    expect(ResearchAnalystOutputSchema.safeParse({ ...valid, Novelty: 101 }).success).toBe(false);
  });
});

describe("REQ-AGENT-002: the Problem Discovery contract", () => {
  it("REQ-AGENT-002: PainLevel is 1 to 5 and Customer has segment, role, and industry", () => {
    const valid = {
      Problem: "Growers cannot tell which crops a storm will damage.",
      Customer: {
        Segment: "regional governments",
        Role: "disaster officer",
        Industry: "public-sector",
      },
      PainLevel: 4,
      PainRationale: "Losses are large and decisions are urgent.",
      Confidence: 0.5,
      Notes: null,
    };
    expect(ProblemDiscoveryOutputSchema.safeParse(valid).success).toBe(true);
    expect(ProblemDiscoveryOutputSchema.safeParse({ ...valid, PainLevel: 0 }).success).toBe(false);
    expect(
      ProblemDiscoveryOutputSchema.safeParse({
        ...valid,
        Customer: { ...valid.Customer, Role: "" },
      }).success,
    ).toBe(false);
  });
});

describe("REQ-AGENT-006: the Relevance contract and StrategicRelevanceScore", () => {
  it("REQ-AGENT-006: AC1 the model output has all eight industries and no StrategicRelevanceScore", () => {
    expect(RelevanceModelOutputSchema.safeParse(relevance).success).toBe(true);
    expect(
      RelevanceModelOutputSchema.safeParse({ ...relevance, StrategicRelevanceScore: 70 }).success,
    ).toBe(false);
    const { banking: _dropped, ...seven } = relevance.IndustryFit;
    expect(RelevanceModelOutputSchema.safeParse({ ...relevance, IndustryFit: seven }).success).toBe(
      false,
    );
    expect(
      RelevanceModelOutputSchema.safeParse({
        ...relevance,
        IndustryFit: { ...relevance.IndustryFit, other: 5 },
      }).success,
    ).toBe(false);
  });

  it("REQ-AGENT-006: the score is the highest fit, raised by 5 for partial and 10 for clear, at most 100", () => {
    expect(strategicRelevanceScore(relevance)).toBe(70);
    expect(
      strategicRelevanceScore({
        ...relevance,
        FocusMatch: { ...focus("none"), banking: "partial" },
      }),
    ).toBe(75);
    expect(
      strategicRelevanceScore({ ...relevance, FocusMatch: { ...focus("none"), banking: "clear" } }),
    ).toBe(80);
    expect(
      strategicRelevanceScore({
        IndustryFit: fits(95),
        FocusMatch: { ...focus("none"), banking: "clear" },
      }),
    ).toBe(100);
    // A focus match of an industry that is not the best does not count.
    expect(
      strategicRelevanceScore({
        ...relevance,
        FocusMatch: { ...focus("none"), insurance: "clear" },
      }),
    ).toBe(70);
  });

  it("REQ-AGENT-006: on a tie for the best fit every tied industry is best and the larger raise counts", () => {
    const tied = { ...relevance, IndustryFit: { ...fits(70), insurance: 70 } };
    expect(bestIndustries(tied)).toEqual(["banking", "insurance"]);
    expect(
      strategicRelevanceScore({ ...tied, FocusMatch: { ...focus("none"), insurance: "clear" } }),
    ).toBe(80);
  });
});
