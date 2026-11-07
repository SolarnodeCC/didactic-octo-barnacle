import {
  FakeWorkersAi,
  TriageModelOutputSchema,
  callModel,
  type CallModelDeps,
  type ModelCallRecord,
  type PriceTable,
} from "@roi/models";
import { describe, expect, it } from "vitest";

import { counter, createTestDatabase } from "../test/sqlite-d1.js";
import { createModelUsageStore, usageTotalsForDay } from "./model-usage.js";

const MODEL = "@cf/zai-org/glm-4.7-flash";

const prices: PriceTable = {
  Version: "2026-11-06",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.1165,
  ExchangeRateDate: "2026-11-06",
  Models: { [MODEL]: { InputUsdPerMillionTokens: 0.06, OutputUsdPerMillionTokens: 0.4 } },
};

const triage = {
  Signals: {
    NamedParty: true,
    StatedHarm: true,
    Trigger: true,
    ExistingAlternative: false,
    Adoptable: false,
  },
  Notes: null,
};

function deps(ai: FakeWorkersAi, limit: number) {
  const test = createTestDatabase();
  const usage = createModelUsageStore(test.Db, { Amount: limit, Currency: "EUR" });
  const callDeps: CallModelDeps = {
    Ai: ai,
    GatewayId: "roi-local",
    Usage: usage,
    Prices: prices,
    MaxAttempts: 3,
    NewId: counter("mc_"),
    Now: () => new Date("2026-11-07T12:00:00.000Z"),
    Sleep: () => Promise.resolve(),
  };
  return { test, usage, callDeps };
}

function request(publicationId: string, agent: string | null = null) {
  return {
    RunKind: "processing" as const,
    RunId: "run_1",
    StepName: "triage",
    Agent: agent,
    PublicationId: publicationId,
    CandidateId: null,
    Config: { Model: MODEL, PromptVersion: "triage@1", OutputMode: "json-schema" as const },
    Prompt: { System: "s", User: "<publication>text</publication>" },
    Contract: TriageModelOutputSchema,
  };
}

describe("REQ-NFR-011: usage records in D1", () => {
  it("REQ-NFR-011: AC1 each attempt writes one model_call row and adds to the day's spend", async () => {
    const ai = new FakeWorkersAi([
      { Kind: "error", Status: 503 },
      { Kind: "output", Output: triage, InputTokens: 500, OutputTokens: 100 },
    ]);
    const { test, callDeps } = deps(ai, 5);
    const result = await callModel(callDeps, request("pub_1"));
    expect(result).toMatchObject({ Ok: true, Attempts: 2 });

    const rows = test.Raw.prepare(
      "SELECT attempt, outcome, input_tokens, estimated, price_table_version, gateway_request_id FROM model_call ORDER BY attempt",
    ).all();
    expect(rows).toEqual([
      {
        attempt: 1,
        outcome: "provider-error",
        input_tokens: 0,
        estimated: 1,
        price_table_version: "2026-11-06",
        gateway_request_id: "log_1",
      },
      {
        attempt: 2,
        outcome: "ok",
        input_tokens: 500,
        estimated: 1,
        price_table_version: "2026-11-06",
        gateway_request_id: "log_2",
      },
    ]);
    const budget = test.Raw.prepare("SELECT * FROM budget_day").get() as {
      day: string;
      spent_amount: number;
      limit_amount: number;
    };
    expect(budget.day).toBe("2026-11-07");
    expect(budget.limit_amount).toBe(5);
    // Costs are rounded to 1e-8 EUR (price-table.ts).
    expect(budget.spent_amount).toBeCloseTo((500 * 0.06 + 100 * 0.4) / 1_000_000 / 1.1165, 7);
  });

  it("REQ-NFR-011: AC4 totals per step, agent, and day come from the records alone", async () => {
    const ai = new FakeWorkersAi([
      { Kind: "output", Output: triage, InputTokens: 400, OutputTokens: 80 },
      { Kind: "output", Output: triage, InputTokens: 600, OutputTokens: 120 },
      { Kind: "output", Output: triage, InputTokens: 100, OutputTokens: 10 },
    ]);
    const { test, callDeps } = deps(ai, 5);
    await callModel(callDeps, request("pub_1"));
    await callModel(callDeps, request("pub_2"));
    await callModel(callDeps, request("pub_3", "research-analyst"));

    const totals = await usageTotalsForDay(test.Db, "2026-11-07");
    expect(totals.map(({ CostAmount: _cost, ...rest }) => rest)).toEqual([
      { StepName: "triage", Agent: null, Calls: 2, InputTokens: 1000, OutputTokens: 200 },
      {
        StepName: "triage",
        Agent: "research-analyst",
        Calls: 1,
        InputTokens: 100,
        OutputTokens: 10,
      },
    ]);
    const spent = (
      test.Raw.prepare("SELECT spent_amount FROM budget_day").get() as {
        spent_amount: number;
      }
    ).spent_amount;
    expect(totals.reduce((sum, total) => sum + total.CostAmount, 0)).toBeCloseTo(spent, 12);
    expect(await usageTotalsForDay(test.Db, "2026-11-08")).toEqual([]);
  });

  it("REQ-NFR-011: a cost in another currency than the budget is refused", async () => {
    const { usage } = deps(new FakeWorkersAi([]), 5);
    const record = {
      Cost: { Amount: 0.1, Currency: "USD" },
      CreatedAt: "2026-11-07T12:00:00Z",
    } as ModelCallRecord;
    await expect(usage.record(record)).rejects.toThrow(/USD/);
  });
});

describe("REQ-NFR-005: the daily budget in D1", () => {
  it("REQ-NFR-005: AC2 once the day's spend reaches the limit, new steps are refused", async () => {
    const ai = new FakeWorkersAi([
      { Kind: "output", Output: triage, InputTokens: 1_000_000, OutputTokens: 0 },
      { Kind: "output", Output: triage },
    ]);
    const { test, callDeps } = deps(ai, 0.05);
    expect(await callModel(callDeps, request("pub_1"))).toMatchObject({ Ok: true });
    expect(await callModel(callDeps, request("pub_2"))).toEqual({
      Ok: false,
      Reason: "budget-exhausted",
      Attempts: 0,
    });
    expect(ai.Remaining).toBe(1);
    expect(test.Raw.prepare("SELECT COUNT(*) AS n FROM model_call").get()).toEqual({ n: 1 });
  });

  it("REQ-NFR-005: a zero budget refuses the first step of the day", async () => {
    const { usage } = deps(new FakeWorkersAi([]), 0);
    expect(await usage.budgetAllows("2026-11-07")).toBe(false);
  });
});
