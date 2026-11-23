import { describe, expect, it } from "vitest";

import { type CallModelDeps, type ModelUsageStore } from "./call-model.js";
import { callEmbedding, fakeEmbedding, parseEmbedding } from "./embedding.js";
import { FakeWorkersAi, type FakeReply } from "./fake-workers-ai.js";
import { ModelCallRecordSchema, type ModelCallRecord } from "./model-call.js";
import { type PriceTable } from "./price-table.js";

const MODEL = "@cf/baai/bge-base-en-v1.5";

const prices: PriceTable = {
  Version: "2026-11-11",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.1165,
  ExchangeRateDate: "2026-11-11",
  Models: { [MODEL]: { InputUsdPerMillionTokens: 0.0666, OutputUsdPerMillionTokens: 0 } },
};

class MemoryUsage implements ModelUsageStore {
  readonly Records: ModelCallRecord[] = [];
  constructor(readonly Allowed: boolean) {}
  budgetAllows(): Promise<boolean> {
    return Promise.resolve(this.Allowed);
  }
  record(record: ModelCallRecord): Promise<void> {
    this.Records.push(ModelCallRecordSchema.parse(record));
    return Promise.resolve();
  }
}

function setup(replies: FakeReply[], allowed = true) {
  const ai = new FakeWorkersAi(replies);
  const usage = new MemoryUsage(allowed);
  let id = 0;
  const deps: CallModelDeps = {
    Ai: ai,
    GatewayId: "roi-local",
    Usage: usage,
    Prices: prices,
    MaxAttempts: 3,
    NewId: () => `mc_${(id += 1)}`,
    Now: () => new Date("2026-11-23T12:00:00Z"),
    Sleep: () => Promise.resolve(),
  };
  return { ai, usage, deps };
}

const request = {
  RunKind: "processing" as const,
  RunId: "run_1",
  StepName: "embedding",
  Model: MODEL,
  Texts: ["Grid operators lose transformers", "Banks reconcile payments by hand"],
};

describe("REQ-PROC-001: embedding calls", () => {
  it("REQ-PROC-001 AC3: one batch call through AI Gateway returns a vector per text and one record", async () => {
    const { ai, usage, deps } = setup([{ Kind: "embedding", InputTokens: 12 }]);
    const result = await callEmbedding(deps, request);
    expect(result).toMatchObject({ Ok: true, Attempts: 1 });
    expect(result.Ok && result.Vectors).toHaveLength(2);
    expect(ai.Calls).toHaveLength(1);
    expect(ai.Calls[0]?.Inputs).toEqual({ text: request.Texts });
    expect(ai.Calls[0]?.Options.gateway).toEqual({
      id: "roi-local",
      metadata: { RunId: "run_1", Step: "embedding" },
    });
    expect(usage.Records).toHaveLength(1);
    expect(usage.Records[0]).toMatchObject({
      Model: MODEL,
      PromptVersion: null,
      InputTokens: 12,
      OutputTokens: 0,
      Outcome: "ok",
      CallKind: "model",
      Estimated: true,
    });
  });

  it("REQ-PROC-001: without usage in the response the input tokens are estimated", async () => {
    const { usage, deps } = setup([{ Kind: "embedding" }]);
    await callEmbedding(deps, request);
    expect(usage.Records[0]?.InputTokens).toBe(
      Math.ceil(request.Texts[0]!.length / 4) + Math.ceil(request.Texts[1]!.length / 4),
    );
  });

  it("REQ-NFR-005: a refused budget makes no call", async () => {
    const { ai, deps } = setup([{ Kind: "embedding" }], false);
    expect(await callEmbedding(deps, request)).toEqual({
      Ok: false,
      Reason: "budget-exhausted",
      Attempts: 0,
    });
    expect(ai.Calls).toHaveLength(0);
  });

  it("REQ-AGENT-012: a provider error is retried and counts as an attempt", async () => {
    const { usage, deps } = setup([{ Kind: "error", Status: 503 }, { Kind: "embedding" }]);
    expect(await callEmbedding(deps, request)).toMatchObject({ Ok: true, Attempts: 2 });
    expect(usage.Records.map((r) => r.Outcome)).toEqual(["provider-error", "ok"]);
  });

  it("REQ-PROC-001: a response with the wrong number of vectors is invalid output", async () => {
    const one = fakeEmbedding("one", 4);
    const { deps } = setup([
      { Kind: "embedding", Data: [one] },
      { Kind: "embedding", Data: [one] },
      { Kind: "embedding", Data: [one] },
    ]);
    expect(await callEmbedding(deps, request)).toMatchObject({
      Ok: false,
      Reason: "invalid-output",
      Attempts: 3,
    });
  });

  it("REQ-PROC-001: the bge response shape is parsed, any other shape is not", () => {
    expect(parseEmbedding({ shape: [1, 2], data: [[0.1, 0.2]] })).toEqual({
      Vectors: [[0.1, 0.2]],
      InputTokens: null,
    });
    expect(parseEmbedding({ response: "text" })).toBeNull();
    expect(parseEmbedding({ data: [["x"]] })).toBeNull();
  });

  it("REQ-PROC-003: the fake embedding is deterministic and normalised, and shared words are close", () => {
    const a = fakeEmbedding("grid operators transformers");
    const b = fakeEmbedding("grid operators substations");
    const c = fakeEmbedding("bank payments reconciliation");
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * (y[i] ?? 0), 0);
    expect(fakeEmbedding("grid operators transformers")).toEqual(a);
    expect(dot(a, a)).toBeCloseTo(1, 10);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});
