import { readFileSync } from "node:fs";

import { REFERENCE_EMBEDDING } from "@roi/vector-store";
import { describe, expect, it } from "vitest";

import { PRICE_TABLE } from "../prices.js";
import { DEFAULT_PROCESSING_CONFIG, loadProcessingConfig } from "../processing-config.js";
import { dailyBudget, estimatedCosts, type BudgetModels } from "./daily-budget.js";

const wrangler = readFileSync(
  new URL("../../../../infrastructure/cloudflare/wrangler.toml", import.meta.url),
  "utf8",
);

const MODELS: BudgetModels = {
  triage: DEFAULT_PROCESSING_CONFIG.TriageModel.Model,
  extraction: DEFAULT_PROCESSING_CONFIG.ExtractionModel.Model,
  embedding: REFERENCE_EMBEDDING.Model,
};

/** The `vars` of one environment in wrangler.toml; `local` is the top-level `[vars]` table. */
function varsOf(environment: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (environment === "local") {
    const table = /^\[vars\]\n((?:[A-Z_]+ = "[^"]*"\n)+)/m.exec(wrangler);
    for (const [, key, value] of (table?.[1] ?? "").matchAll(/^([A-Z_]+) = "([^"]*)"$/gm)) {
      vars[key as string] = value as string;
    }
    return vars;
  }
  const line = new RegExp(`^\\[env\\.${environment}\\]\\n(?:.*\\n)*?vars = \\{(.*)\\}$`, "m").exec(
    wrangler,
  );
  for (const [, key, value] of (line?.[1] ?? "").matchAll(/([A-Z_]+) = "([^"]*)"/g)) {
    vars[key as string] = value as string;
  }
  return vars;
}

function budgetOf(environment: string): number {
  const processing = loadProcessingConfig(varsOf(environment));
  const costs = estimatedCosts(
    processing.BudgetEstimate,
    PRICE_TABLE,
    MODELS,
    processing.FullTextMaxChars,
  );
  return dailyBudget(
    {
      ExpectedDailyTriaged: processing.ExpectedDailyTriaged,
      DailyExtractionLimit: processing.DailyExtractionLimit,
      ExpectedDailyEmbeddings: processing.ExpectedDailyEmbeddings,
      Multiplier: processing.BudgetMultiplier,
    },
    costs,
  ).Limit.Amount;
}

describe("REQ-NFR-005: the daily budget from the formula of ADR 0059", () => {
  it("REQ-NFR-005: adds the three steps and applies the multiplier", () => {
    const result = dailyBudget(
      {
        ExpectedDailyTriaged: 1000,
        DailyExtractionLimit: 100,
        ExpectedDailyEmbeddings: 1000,
        Multiplier: 1.5,
      },
      {
        triage: { Amount: 0.0001, Source: "estimated" },
        extraction: { Amount: 0.002, Source: "measured" },
        embedding: { Amount: 0.00002, Source: "estimated" },
      },
    );
    expect(result.Parts).toEqual({ triage: 0.1, extraction: 0.2, embedding: 0.02 });
    expect(result.Limit).toEqual({ Amount: 0.48, Currency: "EUR" });
  });

  it("REQ-NFR-005: estimates each step from the benchmark cost and prices the full-text input", () => {
    const costs = estimatedCosts(
      DEFAULT_PROCESSING_CONFIG.BudgetEstimate,
      PRICE_TABLE,
      MODELS,
      DEFAULT_PROCESSING_CONFIG.FullTextMaxChars,
    );
    // Triage: USD 0.0000876 at 1.1193 USD per EUR (ADR 0088).
    expect(costs.triage.Amount).toBeCloseTo(0.0000783, 7);
    // Extraction: USD 0.002344 on abstracts (ADR 0091) plus (24,000 / 4 - 373) more input
    // tokens at USD 0.30 per million (ADR 0059).
    expect(costs.extraction.Amount).toBeCloseTo((0.002344 + 5627 * 0.3e-6) / 1.1193, 7);
    // Embedding: 400 tokens at USD 0.0666 per million.
    expect(costs.embedding.Amount).toBeCloseTo((400 * 0.0666e-6) / 1.1193, 8);
    expect(Object.values(costs).every((cost) => cost.Source === "estimated")).toBe(true);
  });

  it("REQ-NFR-005: a model with no price is refused, never guessed", () => {
    expect(() =>
      estimatedCosts(
        DEFAULT_PROCESSING_CONFIG.BudgetEstimate,
        PRICE_TABLE,
        { ...MODELS, extraction: "@cf/example/unpriced" },
        DEFAULT_PROCESSING_CONFIG.FullTextMaxChars,
      ),
    ).toThrow(/no price for @cf\/example\/unpriced/);
  });

  it.each([
    ["local", 0.5557],
    ["preview", 0.5557],
    ["staging", 1.2498],
    ["production", 1.2498],
  ])("REQ-NFR-005: %s has its own budget from its wrangler.toml volumes", (environment, euro) => {
    expect(budgetOf(environment)).toBeCloseTo(euro, 3);
  });
});
