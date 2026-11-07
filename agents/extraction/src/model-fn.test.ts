import {
  FakeWorkersAi,
  type CallModelDeps,
  type FakeReply,
  type ModelCallRecord,
} from "@roi/models";
import { describe, expect, it } from "vitest";

import { runExtractionEval, runTriageEval } from "./eval.js";
import { loadExtractionSet, loadThreshold, loadTriageSet } from "./golden-set.js";
import { extractionModelFn, triageModelFn } from "./model-fn.js";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

function deps(replies: FakeReply[]) {
  const records: ModelCallRecord[] = [];
  let id = 0;
  const ai = new FakeWorkersAi(replies);
  const callDeps: CallModelDeps = {
    Ai: ai,
    GatewayId: "roi-evals",
    Usage: {
      budgetAllows: () => Promise.resolve(true),
      record: (record) => {
        records.push(record);
        return Promise.resolve();
      },
    },
    Prices: {
      Version: "2026-11-06",
      Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      UsdPerEur: 1.1165,
      ExchangeRateDate: "2026-11-06",
      Models: { [MODEL]: { InputUsdPerMillionTokens: 0.1, OutputUsdPerMillionTokens: 0.3 } },
    },
    MaxAttempts: 3,
    NewId: () => `mc_${(id += 1)}`,
    Now: () => new Date("2026-11-07T12:00:00Z"),
    Sleep: () => Promise.resolve(),
  };
  return { ai, records, callDeps };
}

describe("REQ-TEST-006: the eval runner scores a model through callModel and the prompts", () => {
  it("REQ-TEST-006: triage@1 with labelled replies passes every golden-set entry", async () => {
    const set = loadTriageSet();
    const replies: FakeReply[] = set.map((entry) => {
      const s = entry.expected.signals;
      return {
        Kind: "output",
        Output: {
          Signals: {
            NamedParty: s.namedParty,
            StatedHarm: s.statedHarm,
            Trigger: s.trigger,
            ExistingAlternative: s.existingAlternative,
            Adoptable: s.adoptable,
          },
          Notes: null,
        },
      };
    });
    const { ai, records, callDeps } = deps(replies);
    const report = await runTriageEval(
      set,
      triageModelFn({ Deps: callDeps, Model: MODEL, RunId: "bench_1" }),
      loadThreshold("triage"),
    );
    expect(report.PassRate).toBe(1);
    expect(ai.Remaining).toBe(0);
    expect(records).toHaveLength(set.length);
    expect(new Set(records.map((r) => r.PromptVersion))).toEqual(new Set(["triage@1"]));
    expect(ai.Calls[0]?.Inputs.temperature).toBe(0);
  });

  it("REQ-TEST-006: extraction@1 with labelled replies passes, so every labelled quote is in the text sent", async () => {
    const set = loadExtractionSet();
    const replies: FakeReply[] = set.map((entry) => ({
      Kind: "output",
      Output: {
        Candidates: entry.expected.candidates.map((c) => ({
          Finding: c.finding,
          EvidenceQuote: c.evidenceQuote,
          Customer: c.customer,
          CustomerQuote: c.customerQuote,
          WhyNow: c.whyNow ?? null,
          WhyNowQuote: c.whyNowQuote ?? null,
          CurrentAlternative: c.currentAlternative ?? null,
          AlternativeQuote: c.alternativeQuote ?? null,
        })),
        Confidence: 0.6,
        Notes: entry.expected.candidates.length === 0 ? (entry.expected.reason ?? "none") : null,
      },
    }));
    const { ai, records, callDeps } = deps(replies);
    const report = await runExtractionEval(
      set,
      extractionModelFn({ Deps: callDeps, Model: MODEL, RunId: "bench_1" }),
      loadThreshold("extraction"),
    );
    expect(report.Entries.filter((e) => !e.Passed)).toEqual([]);
    expect(ai.Remaining).toBe(0);
    expect(records.every((r) => r.Outcome === "ok")).toBe(true);
  });

  it("REQ-AGENT-009: a step that fails every attempt is scored as a failed entry", async () => {
    const set = loadTriageSet().slice(0, 1);
    const bad: FakeReply = { Kind: "output", Output: "no JSON here" };
    const { callDeps } = deps([bad, bad, bad]);
    const report = await runTriageEval(
      set,
      triageModelFn({ Deps: callDeps, Model: MODEL, RunId: "bench_1" }),
      loadThreshold("triage"),
    );
    expect(report.PassRate).toBe(0);
  });
});
