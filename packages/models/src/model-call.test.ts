import { describe, expect, it } from "vitest";

import { MoneySchema } from "./money.js";
import { ModelCallRecordSchema, type ModelCallRecord } from "./model-call.js";

const record: ModelCallRecord = {
  Id: "mc_1",
  RunKind: "processing",
  RunId: "run_1",
  StepName: "triage",
  Agent: null,
  PublicationId: "pub_1",
  CandidateId: null,
  Model: "@cf/zai-org/glm-4.7-flash",
  PromptVersion: "triage@1",
  Attempt: 1,
  InputTokens: 512,
  CachedInputTokens: 0,
  OutputTokens: 96,
  LatencyMs: 840,
  Cost: { Amount: 0.0000691, Currency: "USD" },
  PriceTableVersion: null,
  Estimated: false,
  Outcome: "ok",
  GatewayRequestId: "gw_1",
  CallKind: "model",
  SearchQuery: null,
  SearchResultCount: null,
  CreatedAt: "2026-11-07T12:00:00Z",
};

describe("REQ-NFR-011: model call records", () => {
  it("REQ-NFR-011: AC1 a record holds run, step, model, attempt, tokens, latency, cost, and outcome", () => {
    expect(ModelCallRecordSchema.parse(record)).toEqual(record);
    for (const outcome of ["ok", "invalid-output", "provider-error"] as const) {
      expect(ModelCallRecordSchema.parse({ ...record, Outcome: outcome }).Outcome).toBe(outcome);
    }
  });

  it("REQ-NFR-011: AC1 attempts start at one and counts are not negative", () => {
    expect(ModelCallRecordSchema.safeParse({ ...record, Attempt: 0 }).success).toBe(false);
    expect(ModelCallRecordSchema.safeParse({ ...record, InputTokens: -1 }).success).toBe(false);
    expect(
      ModelCallRecordSchema.safeParse({ ...record, Cost: { Amount: -0.01, Currency: "USD" } })
        .success,
    ).toBe(false);
  });

  it("REQ-NFR-011: AC2 cached input tokens are a non-negative part of the input tokens", () => {
    expect(
      ModelCallRecordSchema.parse({ ...record, CachedInputTokens: 512 }).CachedInputTokens,
    ).toBe(512);
    expect(ModelCallRecordSchema.safeParse({ ...record, CachedInputTokens: 513 }).success).toBe(
      false,
    );
    expect(ModelCallRecordSchema.safeParse({ ...record, CachedInputTokens: -1 }).success).toBe(
      false,
    );
    const { CachedInputTokens: _cached, ...withoutCached } = record;
    expect(ModelCallRecordSchema.safeParse(withoutCached).success).toBe(false);
  });

  it("REQ-NFR-011: AC2 an estimated cost names its price table version", () => {
    expect(ModelCallRecordSchema.safeParse({ ...record, Estimated: true }).success).toBe(false);
    expect(
      ModelCallRecordSchema.parse({ ...record, Estimated: true, PriceTableVersion: "2026-11-06" })
        .PriceTableVersion,
    ).toBe("2026-11-06");
  });

  it("REQ-NFR-011: AC3 a record rejects any field that could carry prompt or publication text", () => {
    expect(
      ModelCallRecordSchema.safeParse({ ...record, Prompt: "Read this abstract" }).success,
    ).toBe(false);
    expect(ModelCallRecordSchema.safeParse({ ...record, Output: "{}" }).success).toBe(false);
  });

  it("REQ-NFR-011: a search call has a query and a result count, a model call has neither", () => {
    const search = {
      ...record,
      CallKind: "search" as const,
      SearchQuery: "predictive maintenance software vendors",
      SearchResultCount: 8,
    };
    expect(ModelCallRecordSchema.parse(search).CallKind).toBe("search");
    expect(ModelCallRecordSchema.safeParse({ ...search, SearchQuery: null }).success).toBe(false);
    expect(ModelCallRecordSchema.safeParse({ ...record, SearchResultCount: 3 }).success).toBe(
      false,
    );
  });
});

describe("REQ-NFR-011: Money", () => {
  it("REQ-NFR-011: Money is an amount with an ISO 4217 currency code", () => {
    expect(MoneySchema.parse({ Amount: 1.5, Currency: "EUR" })).toEqual({
      Amount: 1.5,
      Currency: "EUR",
    });
    expect(MoneySchema.safeParse({ Amount: 1.5, Currency: "eur" }).success).toBe(false);
    expect(MoneySchema.safeParse({ Amount: Number.NaN, Currency: "EUR" }).success).toBe(false);
    expect(MoneySchema.safeParse({ Amount: 1, Currency: "EUR", Note: "x" }).success).toBe(false);
  });
});
