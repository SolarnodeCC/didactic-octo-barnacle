import { describe, expect, it } from "vitest";

import { callModel, type CallModelDeps, type ModelUsageStore } from "./call-model.js";
import { extractionMissingQuotes, extractionOutputSchema } from "./extraction.js";
import { FakeWorkersAi, type FakeReply } from "./fake-workers-ai.js";
import { ModelCallRecordSchema, type ModelCallRecord } from "./model-call.js";
import {
  estimateCost,
  ModelPriceSchema,
  PriceTableSchema,
  type PriceTable,
} from "./price-table.js";
import { TriageModelOutputSchema } from "./triage.js";
import { classifyProviderError, parseGeneration, ProviderCallError } from "./workers-ai.js";

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
    Trigger: false,
    ExistingAlternative: false,
    Adoptable: true,
  },
  Notes: null,
};

class MemoryUsage implements ModelUsageStore {
  readonly Records: ModelCallRecord[] = [];
  Spent = 0;
  constructor(readonly Limit: number) {}
  budgetAllows(): Promise<boolean> {
    return Promise.resolve(this.Spent < this.Limit);
  }
  record(record: ModelCallRecord): Promise<void> {
    this.Records.push(ModelCallRecordSchema.parse(record));
    this.Spent += record.Cost.Amount;
    return Promise.resolve();
  }
}

function setup(replies: FakeReply[], limit = 1) {
  const ai = new FakeWorkersAi(replies);
  const usage = new MemoryUsage(limit);
  const sleeps: number[] = [];
  let id = 0;
  const deps: CallModelDeps = {
    Ai: ai,
    GatewayId: "roi-local",
    Usage: usage,
    Prices: prices,
    MaxAttempts: 3,
    NewId: () => `mc_${(id += 1)}`,
    Now: () => new Date("2026-11-07T12:00:00Z"),
    Sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return { ai, usage, sleeps, deps };
}

const request = {
  RunKind: "processing" as const,
  RunId: "run_1",
  StepName: "triage",
  Agent: null,
  PublicationId: "pub_1",
  CandidateId: null,
  Config: { Model: MODEL, PromptVersion: "triage@1", OutputMode: "json-schema" as const },
  Prompt: { System: "Read the signals.", User: "<publication>Abstract</publication>" },
  Contract: TriageModelOutputSchema,
};

describe("REQ-NFR-003: model calls go through AI Gateway", () => {
  it("REQ-NFR-003: AC2 every call names the gateway and tags run, step, and agent", async () => {
    const { ai, deps } = setup([{ Kind: "output", Output: triage }]);
    await callModel(deps, { ...request, Agent: "triage" });
    expect(ai.Calls[0]?.Options).toEqual({
      gateway: {
        id: "roi-local",
        metadata: { RunId: "run_1", Step: "triage", Agent: "triage" },
      },
    });
  });
});

describe("REQ-AGENT-010: structured model output", () => {
  it("REQ-AGENT-010: AC1 json-schema mode sends the contract as a JSON schema", async () => {
    const { ai, deps } = setup([{ Kind: "output", Output: triage }]);
    const result = await callModel(deps, request);
    const format = ai.Calls[0]?.Inputs.response_format as {
      type: string;
      json_schema: { properties: Record<string, unknown> };
    };
    expect(format.type).toBe("json_schema");
    expect(Object.keys(format.json_schema.properties)).toEqual(["Signals", "Notes"]);
    expect(result.Ok && result.OutputMode).toBe("json-schema");
  });

  it("REQ-AGENT-010: AC4 prompt-only mode sends no schema and still validates", async () => {
    const { ai, deps } = setup([
      { Kind: "output", Output: JSON.stringify({ Signals: {}, Notes: null }) },
      { Kind: "output", Output: JSON.stringify(triage) },
    ]);
    const result = await callModel(deps, {
      ...request,
      Config: { ...request.Config, OutputMode: "prompt-only" },
    });
    expect(ai.Calls[0]?.Inputs.response_format).toBeUndefined();
    expect(result).toMatchObject({ Ok: true, OutputMode: "prompt-only", Attempts: 2 });
  });
});

describe("REQ-AGENT-009: invalid output is retried with the validation errors", () => {
  it("REQ-AGENT-009: AC1 a retry carries the validation errors of the failed attempt", async () => {
    const { ai, usage, deps } = setup([
      { Kind: "output", Output: { Signals: { NamedParty: "yes" }, Notes: null } },
      { Kind: "output", Output: triage },
    ]);
    const result = await callModel(deps, request);
    expect(result).toMatchObject({ Ok: true, Attempts: 2 });
    const retry = ai.Calls[1]?.Inputs.messages as Array<{ role: string; content: string }>;
    expect(retry.at(-1)?.role).toBe("user");
    expect(retry.at(-1)?.content).toContain("Signals.NamedParty");
    expect(usage.Records.map((r) => r.Outcome)).toEqual(["invalid-output", "ok"]);
  });

  it("REQ-AGENT-009: AC2 after the last attempt the step fails with the errors", async () => {
    const bad: FakeReply = { Kind: "output", Output: "not json" };
    const { usage, deps } = setup([bad, bad, bad]);
    const result = await callModel(deps, request);
    expect(result).toEqual({
      Ok: false,
      Reason: "invalid-output",
      Attempts: 3,
      Errors: ["the output is not JSON"],
    });
    expect(usage.Records.map((r) => r.Attempt)).toEqual([1, 2, 3]);
  });
});

describe("REQ-AGENT-011: repair does not use up an attempt", () => {
  it("REQ-AGENT-011: AC4 a fenced output is repaired, accepted on the first attempt, and listed", async () => {
    const { deps } = setup([
      { Kind: "output", Output: "```json\n" + JSON.stringify(triage) + "\n```" },
    ]);
    const result = await callModel(deps, request);
    expect(result).toMatchObject({ Ok: true, Attempts: 1, Repairs: ["stripped-code-fence"] });
  });
});

describe("REQ-AGENT-008: quotes are checked after validation", () => {
  it("REQ-AGENT-008: a quote that is not in the text fails the attempt", async () => {
    const text = "Grid operators report transformer failures that cause outages.";
    const candidate = {
      Finding: "Grid operators lack early warning of transformer failures.",
      EvidenceQuote: "transformer failures that cause outages",
      Customer: "Grid operators",
      CustomerQuote: "Grid operators",
      WhyNow: null,
      WhyNowQuote: null,
      CurrentAlternative: null,
      AlternativeQuote: null,
    };
    const invented = { ...candidate, EvidenceQuote: "failures cost millions" };
    const { usage, deps } = setup([
      { Kind: "output", Output: { Candidates: [invented], Confidence: 0.5, Notes: null } },
      { Kind: "output", Output: { Candidates: [candidate], Confidence: 0.5, Notes: null } },
    ]);
    const contract = extractionOutputSchema();
    const result = await callModel(deps, {
      ...request,
      StepName: "extraction",
      Contract: contract,
      MissingQuotes: (output) => extractionMissingQuotes(output, text),
    });
    expect(result).toMatchObject({ Ok: true, Attempts: 2 });
    expect(usage.Records[0]?.Outcome).toBe("invalid-output");
  });
});

describe("REQ-AGENT-012: provider errors", () => {
  it("REQ-AGENT-012: AC3 a 429 is retried after its Retry-After and counts as an attempt", async () => {
    const { usage, sleeps, deps } = setup([
      { Kind: "error", Status: 429, RetryAfterSeconds: 7 },
      { Kind: "output", Output: triage },
    ]);
    const result = await callModel(deps, request);
    expect(result).toMatchObject({ Ok: true, Attempts: 2 });
    expect(sleeps).toEqual([7000]);
    expect(usage.Records.map((r) => r.Outcome)).toEqual(["provider-error", "ok"]);
  });

  it("REQ-AGENT-012: a 5xx backs off exponentially until the attempts run out", async () => {
    const error: FakeReply = { Kind: "error", Status: 503 };
    const { sleeps, deps } = setup([error, error, error]);
    const result = await callModel(deps, request);
    expect(result).toMatchObject({ Ok: false, Reason: "provider-error", Attempts: 3 });
    expect(sleeps).toEqual([500, 1000]);
  });

  it("REQ-AGENT-012: a 410 for a deprecated model is not retried", async () => {
    const { ai, deps } = setup([{ Kind: "error", Status: 410, Message: "Gone" }]);
    const result = await callModel(deps, request);
    expect(result).toEqual({
      Ok: false,
      Reason: "provider-error",
      Attempts: 1,
      Errors: ["HTTP 410: Gone"],
    });
    expect(ai.Calls).toHaveLength(1);
  });

  it("REQ-AGENT-012: errors without a status are retried, other 4xx are not", () => {
    expect(classifyProviderError(new Error("network")).Retryable).toBe(true);
    expect(classifyProviderError({ status: 400 }).Retryable).toBe(false);
    expect(classifyProviderError(new ProviderCallError("busy", 429, 3))).toMatchObject({
      Retryable: true,
      RetryAfterSeconds: 3,
    });
  });
});

describe("REQ-NFR-011: one usage record per attempt", () => {
  it("REQ-NFR-011: AC1 each attempt is recorded with tokens, cost, gateway log ID, and outcome", async () => {
    const { usage, deps } = setup([
      { Kind: "error", Status: 500 },
      { Kind: "output", Output: triage, InputTokens: 500, OutputTokens: 100 },
    ]);
    await callModel(deps, request);
    expect(usage.Records).toHaveLength(2);
    expect(usage.Records[1]).toMatchObject({
      RunKind: "processing",
      RunId: "run_1",
      StepName: "triage",
      Model: MODEL,
      PromptVersion: "triage@1",
      Attempt: 2,
      InputTokens: 500,
      OutputTokens: 100,
      Outcome: "ok",
      GatewayRequestId: "log_2",
      CallKind: "model",
    });
    expect(usage.Records[0]).toMatchObject({
      Attempt: 1,
      InputTokens: 0,
      Outcome: "provider-error",
    });
  });

  it("REQ-NFR-011: AC2 the cost is estimated from the price table and names its version", async () => {
    const { usage, deps } = setup([
      { Kind: "output", Output: triage, InputTokens: 1_000_000, OutputTokens: 1_000_000 },
    ]);
    await callModel(deps, request);
    expect(usage.Records[0]).toMatchObject({
      Estimated: true,
      PriceTableVersion: "2026-11-06",
      Cost: { Amount: 0.41200179, Currency: "EUR" },
    });
    expect(
      estimateCost(prices, "@cf/unknown/model", { InputTokens: 1, OutputTokens: 1 }),
    ).toBeNull();
  });

  it("REQ-NFR-011: AC2 a model without a price is refused before any call", async () => {
    const { ai, deps } = setup([{ Kind: "output", Output: triage }]);
    await expect(
      callModel(deps, { ...request, Config: { ...request.Config, Model: "@cf/unknown/model" } }),
    ).rejects.toThrow(/no price/);
    expect(ai.Calls).toHaveLength(0);
  });

  it("REQ-NFR-011: AC3 records hold no prompt or publication text", async () => {
    const { usage, deps } = setup([{ Kind: "output", Output: triage }]);
    await callModel(deps, request);
    const stored = JSON.stringify(usage.Records);
    expect(stored).not.toContain("Abstract");
    expect(stored).not.toContain("Read the signals");
  });
});

describe("REQ-NFR-005: the daily budget", () => {
  it("REQ-NFR-005: AC2 a new step is refused once the budget is reached, with no call", async () => {
    const { ai, usage, deps } = setup([{ Kind: "output", Output: triage }], 0);
    expect(await callModel(deps, request)).toEqual({
      Ok: false,
      Reason: "budget-exhausted",
      Attempts: 0,
    });
    expect(ai.Calls).toHaveLength(0);
    expect(usage.Records).toHaveLength(0);
  });

  it("REQ-NFR-005: AC2 a started step finishes its retries after the budget is passed", async () => {
    // The first attempt alone spends more than the limit; the retry still runs.
    const { usage, deps } = setup(
      [
        { Kind: "output", Output: "not json", InputTokens: 1_000_000, OutputTokens: 0 },
        { Kind: "output", Output: triage },
      ],
      0.01,
    );
    const result = await callModel(deps, request);
    expect(result).toMatchObject({ Ok: true, Attempts: 2 });
    expect(usage.Spent).toBeGreaterThan(0.01);
  });
});

describe("REQ-TEST-002: the helper runs without a live model", () => {
  it("REQ-TEST-002: AC2 the fake binding fails loudly when a test runs out of replies", async () => {
    const { deps } = setup([]);
    const result = await callModel(deps, { ...request });
    expect(result).toMatchObject({ Ok: false, Reason: "provider-error", Attempts: 3 });
  });

  it("REQ-TEST-002: both response shapes give the output and token counts", () => {
    expect(
      parseGeneration({ response: "{}", usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    ).toEqual({ Output: "{}", InputTokens: 5, OutputTokens: 2, CachedInputTokens: 0 });
    expect(
      parseGeneration({
        choices: [{ message: { content: "{}" } }],
        usage: { input_tokens: 4, output_tokens: 1 },
      }),
    ).toEqual({ Output: "{}", InputTokens: 4, OutputTokens: 1, CachedInputTokens: 0 });
  });
});

const DEEPSEEK = "@cf/deepseek-ai/deepseek-v4.1-flash-1017";

/** List prices of 2026-11-10 at one dollar per euro, so the estimate reads in US dollars. */
const cachedPrices: PriceTable = {
  Version: "2026-11-10",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1,
  ExchangeRateDate: "2026-11-09",
  Models: {
    [MODEL]: { InputUsdPerMillionTokens: 0.06, OutputUsdPerMillionTokens: 0.4 },
    [DEEPSEEK]: {
      InputUsdPerMillionTokens: 0.3,
      CachedInputUsdPerMillionTokens: 0.006,
      OutputUsdPerMillionTokens: 1.2,
    },
  },
};

/**
 * Token counts and the cost AI Gateway logged (US dollars) for three extraction calls of the
 * round-one sample in `roi-staging` on 2026-11-10 (ADR 0078). Only counts and costs are kept.
 */
const LOGGED_DEEPSEEK_CALLS = [
  { InputTokens: 1027, CachedInputTokens: 960, OutputTokens: 2443, GatewayUsd: 0.0029574599 },
  { InputTokens: 1466, CachedInputTokens: 1152, OutputTokens: 521, GatewayUsd: 0.0007263119 },
  { InputTokens: 2069, CachedInputTokens: 1408, OutputTokens: 811, GatewayUsd: 0.0011799479 },
];

describe("REQ-NFR-011: cached input tokens are billed at the cached price (ADR 0078)", () => {
  it("REQ-NFR-011: AC4 the estimate of a cached DeepSeek call matches the cost the gateway logged", () => {
    for (const call of LOGGED_DEEPSEEK_CALLS) {
      const cost = estimateCost(cachedPrices, DEEPSEEK, call);
      // Costs are rounded to 1e-8 of the budget currency.
      expect(cost?.Amount).toBeCloseTo(call.GatewayUsd, 8);
      // Billing every input token at the full price overstates the call.
      const uncached = estimateCost(cachedPrices, DEEPSEEK, { ...call, CachedInputTokens: 0 });
      expect(uncached?.Amount ?? 0).toBeGreaterThan(call.GatewayUsd * 1.05);
    }
  });

  it("REQ-NFR-011: AC2 cost is uncached input, cached input, and output at their own prices", () => {
    const usage = { InputTokens: 1_000_000, CachedInputTokens: 600_000, OutputTokens: 1_000_000 };
    // 400k x 0.3 + 600k x 0.006 + 1M x 1.2 = 0.12 + 0.0036 + 1.2 dollars.
    expect(estimateCost(cachedPrices, DEEPSEEK, usage)?.Amount).toBeCloseTo(1.3236, 10);
    // A model with no cached price bills cached tokens at its input price.
    expect(estimateCost(cachedPrices, MODEL, usage)?.Amount).toBeCloseTo(0.46, 10);
    // A cached count above the input count is capped at the input count.
    expect(
      estimateCost(cachedPrices, DEEPSEEK, { ...usage, CachedInputTokens: 2_000_000 })?.Amount,
    ).toBeCloseTo(0.006 + 1.2, 10);
  });

  it("REQ-NFR-011: AC1 the cached count is read from usage.prompt_tokens_details", () => {
    expect(
      parseGeneration({
        choices: [{ message: { content: "{}" } }],
        usage: {
          prompt_tokens: 1027,
          completion_tokens: 2443,
          prompt_tokens_details: { cached_tokens: 960 },
        },
      }),
    ).toEqual({ Output: "{}", InputTokens: 1027, OutputTokens: 2443, CachedInputTokens: 960 });
    expect(
      parseGeneration({
        response: "{}",
        usage: { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 4 } },
      }),
    ).toMatchObject({ CachedInputTokens: 4 });
    // Never more than the input, never negative, and zero when absent or unreadable.
    for (const [details, expected] of [
      [{ cached_tokens: 50 }, 10],
      [{ cached_tokens: -3 }, 0],
      [{ cached_tokens: "7" }, 0],
      [null, 0],
    ] as const) {
      expect(
        parseGeneration({
          response: "{}",
          usage: { prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: details },
        }).CachedInputTokens,
      ).toBe(expected);
    }
  });

  it("REQ-NFR-011: AC1 callModel records the cached tokens and their cost", async () => {
    const { usage, deps } = setup([
      {
        Kind: "output",
        Output: triage,
        InputTokens: 1027,
        CachedInputTokens: 960,
        OutputTokens: 2443,
      },
    ]);
    const result = await callModel(
      { ...deps, Prices: cachedPrices },
      { ...request, Config: { ...request.Config, Model: DEEPSEEK } },
    );
    expect(result).toMatchObject({ Ok: true });
    expect(usage.Records[0]).toMatchObject({
      Model: DEEPSEEK,
      InputTokens: 1027,
      CachedInputTokens: 960,
      OutputTokens: 2443,
      PriceTableVersion: "2026-11-10",
      Cost: { Amount: 0.00295746, Currency: "EUR" },
    });
  });

  it("REQ-NFR-011: AC2 a price table refuses a cached price above the input price", () => {
    expect(
      ModelPriceSchema.safeParse({
        InputUsdPerMillionTokens: 0.3,
        CachedInputUsdPerMillionTokens: 0.31,
        OutputUsdPerMillionTokens: 1.2,
      }).success,
    ).toBe(false);
    expect(
      PriceTableSchema.parse(cachedPrices).Models[DEEPSEEK]?.CachedInputUsdPerMillionTokens,
    ).toBe(0.006);
  });
});
