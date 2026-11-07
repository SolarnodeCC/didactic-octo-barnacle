import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeWorkersAi, type FakeReply, type PriceTable } from "@roi/models";
import { afterEach, describe, expect, it } from "vitest";

import { loadThreshold, loadTriageSet } from "../golden-set.js";
import { parseBenchmarkArgs, runBenchmarkCommand } from "./cli.js";
import { formatBenchmarkMarkdown, percentile, runBenchmark, type BenchmarkPlan } from "./run.js";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const prices: PriceTable = {
  Version: "2026-11-06",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.1165,
  ExchangeRateDate: "2026-11-06",
  Models: { [MODEL]: { InputUsdPerMillionTokens: 0.1, OutputUsdPerMillionTokens: 0.3 } },
};

const triage = loadTriageSet().slice(0, 4);

function signals(index: number) {
  const s = triage[index]!.expected.signals;
  return {
    Signals: {
      NamedParty: s.namedParty,
      StatedHarm: s.statedHarm,
      Trigger: s.trigger,
      ExistingAlternative: s.existingAlternative,
      Adoptable: s.adoptable,
    },
    Notes: null,
  };
}

function plan(overrides: Partial<BenchmarkPlan> = {}): BenchmarkPlan {
  return {
    BenchmarkId: "bench-test",
    Steps: ["triage"],
    Models: { triage: [MODEL], extraction: [] },
    Runs: 2,
    OutputMode: "json-schema",
    BudgetEur: 50,
    ...overrides,
  };
}

function deps(replies: FakeReply[]) {
  let id = 0;
  return {
    Ai: new FakeWorkersAi(replies),
    GatewayId: "roi-staging",
    Prices: prices,
    MaxAttempts: 3,
    NewId: () => `mc_${(id += 1)}`,
    Now: () => new Date("2026-11-07T12:00:00Z"),
    Sleep: () => Promise.resolve(),
  };
}

const inputs = {
  Triage: { Entries: triage, Threshold: loadThreshold("triage") },
  Extraction: { Entries: [], Threshold: loadThreshold("extraction") },
};

describe("REQ-TEST-006: the benchmark round", () => {
  it("REQ-TEST-006: runs every item once per run and scores pass rate and stability", async () => {
    // Run 1: all four right. Run 2: the first is fenced (repaired), the second fails twice
    // then passes, the third is wrong on every attempt, the fourth is right.
    const wrong = {
      ...signals(2),
      Signals: { ...signals(2).Signals, NamedParty: !signals(2).Signals.NamedParty },
    };
    const replies: FakeReply[] = [
      ...[0, 1, 2, 3].map((i) => ({ Kind: "output" as const, Output: signals(i) })),
      { Kind: "output", Output: "```json\n" + JSON.stringify(signals(0)) + "\n```" },
      { Kind: "output", Output: "not json" },
      { Kind: "error", Status: 503 },
      { Kind: "output", Output: signals(1) },
      { Kind: "output", Output: wrong },
      { Kind: "output", Output: signals(3) },
    ];
    const result = await runBenchmark(plan(), inputs, deps(replies));
    const summary = result.Summaries[0]!;
    expect(summary.Runs.map((r) => r.PassRate)).toEqual([1, 0.75]);
    expect(summary.MeanPassRate).toBe(0.875);
    expect(summary.MinPassRate).toBe(0.75);
    expect(summary.Stability).toBe(0.75);
    expect(summary.Steps).toBe(8);
    expect(summary.FirstAttemptValid).toBe(7 / 8);
    expect(summary.RepairRate).toBe(1 / 8);
    expect(summary.FailedAfterMaxAttempts).toBe(0);
    expect(summary.ProviderErrors).toBe(1);
    expect(result.Records).toHaveLength(10);
    expect(result.Raw).toHaveLength(10);
    expect(
      result.Raw.filter((r) => r.Run === 2 && r.PublicationId === triage[1]!.Publication.Id),
    ).toHaveLength(3);
    expect(result.Raw.find((r) => r.Error !== null)?.Error).toContain("503");
    expect(result.BudgetReached).toBe(false);
    expect(formatBenchmarkMarkdown(result, plan())).toContain(
      "| triage | `@cf/google/gemma-4-26b-a4b-it` | 87.5 %",
    );
  });

  it("REQ-NFR-005: the round stops starting steps once the budget is spent", async () => {
    const big: FakeReply = { Kind: "output", Output: signals(0), InputTokens: 10_000_000 };
    const result = await runBenchmark(
      plan({ Runs: 1, BudgetEur: 0.5 }),
      inputs,
      deps([big, big, big, big]),
    );
    // 10M input tokens at $0.10 per million is about EUR 0.90, over the EUR 0.50 budget.
    expect(result.Records).toHaveLength(1);
    expect(result.BudgetReached).toBe(true);
    expect(result.Summaries[0]?.BudgetRefused).toBe(3);
    expect(formatBenchmarkMarkdown(result, plan())).toContain("this round is incomplete");
  });

  it("REQ-NFR-011: an unpriced model is refused before any call", async () => {
    await expect(
      runBenchmark(
        plan({ Models: { triage: ["@cf/unknown/model"], extraction: [] } }),
        inputs,
        deps([]),
      ),
    ).rejects.toThrow(/no price/);
  });

  it("REQ-TEST-006: percentiles use the nearest rank", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("REQ-TEST-006: the benchmark command", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("REQ-TEST-006: parses round one by default and rejects bad flags", () => {
    expect(parseBenchmarkArgs([])).toMatchObject({
      Steps: ["triage", "extraction"],
      Models: null,
      Runs: 3,
      BudgetEur: 50,
      Gateway: "roi-staging",
      DryRun: false,
    });
    expect(
      parseBenchmarkArgs(["--step", "triage", "--models", "@cf/a/b,@cf/c/d", "--runs", "1"]),
    ).toMatchObject({
      Steps: ["triage"],
      Models: ["@cf/a/b", "@cf/c/d"],
      Runs: 1,
    });
    expect(parseBenchmarkArgs(["--models", "@cf/a/b"])).toBeNull();
    expect(parseBenchmarkArgs(["--runs", "0"])).toBeNull();
    expect(parseBenchmarkArgs(["--step", "market"])).toBeNull();
    expect(parseBenchmarkArgs(["--models", "gpt-4"])).toBeNull();
    expect(parseBenchmarkArgs(["--unknown", "x"])).toBeNull();
  });

  it("REQ-TEST-006: a dry run of round one passes every item and writes the report files", async () => {
    const out = mkdtempSync(join(tmpdir(), "roi-bench-"));
    dirs.push(out);
    const args = parseBenchmarkArgs(["--dry-run", "--runs", "1", "--out", out])!;
    const result = await runBenchmarkCommand(
      args,
      {},
      { Now: () => new Date("2026-11-07T12:00:00Z") },
    );
    expect(result.Summaries.map((s) => [s.Step, s.Model, s.MeanPassRate])).toEqual([
      ["triage", "@cf/zai-org/glm-4.7-flash", 1],
      ["triage", "@cf/google/gemma-4-26b-a4b-it", 1],
      ["extraction", "@cf/deepseek-ai/deepseek-v4.1-flash-1017", 1],
      ["extraction", "@cf/google/gemma-4-26b-a4b-it", 1],
    ]);
    const dir = join(out, result.BenchmarkId);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as {
      PriceTableVersion: string;
    };
    expect(summary.PriceTableVersion).toBe("2026-11-06");
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("# Model benchmark");
    const records = readFileSync(join(dir, "model-calls.jsonl"), "utf8").split("\n");
    expect(records).toHaveLength(result.Records.length);
    expect(readFileSync(join(dir, "raw-responses.jsonl"), "utf8").split("\n")).toHaveLength(
      result.Raw.length,
    );
  });

  it("REQ-NFR-003: a live run without credentials stops before any request", async () => {
    const args = parseBenchmarkArgs(["--runs", "1", "--limit", "1"])!;
    await expect(runBenchmarkCommand(args, {})).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });
});
