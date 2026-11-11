import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeWorkersAi, type FakeReply, type PriceTable } from "@roi/models";
import { afterEach, describe, expect, it } from "vitest";

import { loadThreshold, loadTriageSet } from "../golden-set.js";
import { parseBenchmarkArgs, runBenchmarkCommand } from "./cli.js";
import {
  formatBenchmarkMarkdown,
  parseCandidate,
  percentile,
  runBenchmark,
  type BenchmarkPlan,
  type RunCheckpoint,
} from "./run.js";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const REPO_ROOT_FOR_TEST = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

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

/** Signals that all read the opposite of the labelled decision, so the derived decision is wrong (ADR 0087). */
function wrongDecision(index: number) {
  const opposite = !triage[index]!.expected.accepted;
  return {
    ...signals(index),
    Signals: {
      NamedParty: opposite,
      StatedHarm: opposite,
      Trigger: opposite,
      ExistingAlternative: opposite,
      Adoptable: opposite,
    },
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
    const wrong = wrongDecision(2);
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

  it("REQ-TEST-006: a round resumed after its first run gives the same result without repeating calls", async () => {
    const wrong = wrongDecision(2);
    const run1: FakeReply[] = [0, 1, 2, 3].map((i) => ({ Kind: "output", Output: signals(i) }));
    const run2: FakeReply[] = [
      { Kind: "output", Output: signals(0) },
      { Kind: "error", Status: 503 },
      { Kind: "output", Output: signals(1) },
      // Valid against the schema, so accepted at once; the eval fails it on the decision.
      { Kind: "output", Output: wrong },
      { Kind: "output", Output: signals(3) },
    ];
    const checkpoints: RunCheckpoint[] = [];
    const full = await runBenchmark(plan(), inputs, {
      ...deps([...run1, ...run2]),
      OnRunComplete: (c) => {
        checkpoints.push(c);
      },
    });
    expect(checkpoints.map((c) => c.Run)).toEqual([1, 2]);
    expect(checkpoints[0]?.Records).toHaveLength(4);
    expect(checkpoints[1]?.Raw).toHaveLength(5);

    // Stopped after run 1: only run 2's replies are left, so a repeated call would fail.
    const ai = deps(run2);
    const resumed = await runBenchmark(plan(), inputs, { ...ai, Resume: [checkpoints[0]!] });
    expect(ai.Ai.Remaining).toBe(0);
    expect(ai.Ai.Calls).toHaveLength(5);
    const pick = (r: typeof full) =>
      r.Summaries.map((s) => ({
        Runs: s.Runs,
        Mean: s.MeanPassRate,
        Stability: s.Stability,
        Steps: s.Steps,
        FirstAttemptValid: s.FirstAttemptValid,
        Failed: s.FailedAfterMaxAttempts,
        ProviderErrors: s.ProviderErrors,
        CostEur: s.CostEur,
      }));
    expect(pick(resumed)).toEqual(pick(full));
    expect(resumed.Summaries[0]?.Stability).toBe(0.75);
    expect(resumed.Records).toHaveLength(full.Records.length);
    expect(resumed.Raw.map((r) => r.Call)).toEqual(full.Raw.map((r) => r.Call));
    expect(resumed.TotalCostEur).toBeCloseTo(full.TotalCostEur, 12);
  });

  it("REQ-NFR-005: the cost of resumed runs counts against the budget", async () => {
    const big: FakeReply = { Kind: "output", Output: signals(0), InputTokens: 10_000_000 };
    const checkpoints: RunCheckpoint[] = [];
    await runBenchmark(plan({ Runs: 1 }), inputs, {
      ...deps([big, big, big, big]),
      OnRunComplete: (c) => {
        checkpoints.push(c);
      },
    });
    // Run 1 spent about EUR 3.6, so with a budget of EUR 0.5 run 2 starts no step.
    const result = await runBenchmark(plan({ Runs: 2, BudgetEur: 0.5 }), inputs, {
      ...deps([]),
      Resume: checkpoints,
    });
    expect(result.BudgetReached).toBe(true);
    expect(result.Summaries[0]?.BudgetRefused).toBe(4);
    expect(result.Records).toHaveLength(4);
  });

  it("REQ-TEST-006: a checkpoint of another round or outside the plan is refused", async () => {
    const checkpoints: RunCheckpoint[] = [];
    await runBenchmark(plan({ Runs: 1 }), inputs, {
      ...deps([0, 1, 2, 3].map((i) => ({ Kind: "output" as const, Output: signals(i) }))),
      OnRunComplete: (c) => {
        checkpoints.push(c);
      },
    });
    await expect(
      runBenchmark(plan({ BenchmarkId: "bench-other" }), inputs, {
        ...deps([]),
        Resume: checkpoints,
      }),
    ).rejects.toThrow(/does not belong/);
    await expect(
      runBenchmark(plan(), inputs, {
        ...deps([]),
        Resume: [{ ...checkpoints[0]!, Run: 3 }],
      }),
    ).rejects.toThrow(/not in the plan/);
  });

  it("REQ-AGENT-014: a candidate is a pinned model with an optional reasoning setting", () => {
    expect(parseCandidate("@cf/openai/gpt-oss-120b")).toEqual({
      Label: "@cf/openai/gpt-oss-120b",
      Model: "@cf/openai/gpt-oss-120b",
    });
    expect(parseCandidate("@cf/google/gemma-4-26b-a4b-it+reasoning=off")).toEqual({
      Label: "@cf/google/gemma-4-26b-a4b-it+reasoning=off",
      Model: "@cf/google/gemma-4-26b-a4b-it",
      Reasoning: { Thinking: false },
    });
    expect(parseCandidate("@cf/openai/gpt-oss-120b+reasoning=low")?.Reasoning).toEqual({
      Effort: "low",
    });
    expect(parseCandidate("@cf/openai/gpt-oss-120b+reasoning=max")).toBeNull();
    expect(parseCandidate("@cf/openai/gpt-oss-120b+temperature=1")).toBeNull();
    expect(parseCandidate("gpt-4")).toBeNull();
  });

  it("REQ-AGENT-014: a reasoning variant sends its setting, records the bare model, and reports its label", async () => {
    const variant = `${MODEL}+reasoning=off`;
    const replies: FakeReply[] = [0, 1, 2, 3].map((i) => ({ Kind: "output", Output: signals(i) }));
    const d = deps(replies);
    const result = await runBenchmark(
      plan({ Runs: 1, Models: { triage: [variant], extraction: [] } }),
      inputs,
      d,
    );
    expect(d.Ai.Calls[0]?.Inputs.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(new Set(result.Records.map((r) => r.Model))).toEqual(new Set([MODEL]));
    expect(result.Summaries[0]?.Model).toBe(variant);
    expect(result.Raw[0]?.Model).toBe(variant);
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
      TimeoutMs: 600_000,
      Stream: true,
      DryRun: false,
    });
    // The price table of `model.price_table_version` (REQ-NFR-011, ADR 0078).
    expect(parseBenchmarkArgs([])?.Prices).toMatch(
      /infrastructure\/cloudflare\/prices\/2026-11-11\.json$/u,
    );
    expect(parseBenchmarkArgs(["--no-stream", "--timeout-ms", "90000"])).toMatchObject({
      Stream: false,
      TimeoutMs: 90_000,
    });
    expect(parseBenchmarkArgs(["--timeout-ms", "0"])).toBeNull();
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
    expect(
      parseBenchmarkArgs([
        "--step",
        "triage",
        "--models",
        "@cf/google/gemma-4-26b-a4b-it+reasoning=off",
      ])?.Models,
    ).toEqual(["@cf/google/gemma-4-26b-a4b-it+reasoning=off"]);
    expect(
      parseBenchmarkArgs(["--step", "triage", "--models", "@cf/a/b+reasoning=max"]),
    ).toBeNull();
    expect(parseBenchmarkArgs(["--unknown", "x"])).toBeNull();
  });

  it("REQ-TEST-006: a dry run of round two passes every item and writes the report files", async () => {
    const out = mkdtempSync(join(tmpdir(), "roi-bench-"));
    dirs.push(out);
    const args = parseBenchmarkArgs(["--dry-run", "--runs", "1", "--out", out])!;
    const result = await runBenchmarkCommand(
      args,
      {},
      { Now: () => new Date("2026-11-07T12:00:00Z") },
    );
    expect(result.Summaries.map((s) => [s.Step, s.Model, s.MeanPassRate])).toEqual([
      ["triage", "@cf/google/gemma-4-26b-a4b-it", 1],
      ["triage", "@cf/google/gemma-4-26b-a4b-it+reasoning=off", 1],
      ["triage", "@cf/openai/gpt-oss-120b", 1],
      ["extraction", "@cf/deepseek-ai/deepseek-v4.1-flash-1017", 1],
      ["extraction", "@cf/openai/gpt-oss-120b", 1],
    ]);
    const dir = join(out, result.BenchmarkId);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as {
      PriceTableVersion: string;
    };
    expect(summary.PriceTableVersion).toBe("2026-11-11");
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("# Model benchmark");
    const records = readFileSync(join(dir, "model-calls.jsonl"), "utf8").split("\n");
    expect(records).toHaveLength(result.Records.length);
    expect(readFileSync(join(dir, "raw-responses.jsonl"), "utf8").split("\n")).toHaveLength(
      result.Raw.length,
    );
  });

  it("REQ-TEST-006: --resume takes a benchmark ID and no plan flags", () => {
    expect(parseBenchmarkArgs(["--resume", "bench-2026-11-10T12-21-14-407Z"])).toMatchObject({
      Resume: "bench-2026-11-10T12-21-14-407Z",
    });
    expect(parseBenchmarkArgs(["--resume", "bench-1", "--runs", "1"])).toBeNull();
    expect(parseBenchmarkArgs(["--resume", "bench-1", "--models", "@cf/a/b"])).toBeNull();
    expect(parseBenchmarkArgs(["--resume", "../bench-1"])).toBeNull();
    expect(parseBenchmarkArgs(["--resume", "bench-1", "--timeout-ms", "1000"])).toMatchObject({
      Resume: "bench-1",
      TimeoutMs: 1000,
    });
  });

  it("REQ-TEST-006: a stopped round resumes from its checkpoint file with the stored plan", async () => {
    const out = mkdtempSync(join(tmpdir(), "roi-bench-"));
    dirs.push(out);
    const first = await runBenchmarkCommand(
      parseBenchmarkArgs([
        "--dry-run",
        "--step",
        "triage",
        "--runs",
        "2",
        "--limit",
        "3",
        "--out",
        out,
      ])!,
      {},
      { Now: () => new Date("2026-11-11T09:00:00Z") },
    );
    const dir = join(out, first.BenchmarkId);
    const stored = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as {
      Limit: number;
      PriceTableVersion: string;
    };
    expect(stored).toMatchObject({ Limit: 3, PriceTableVersion: "2026-11-11" });
    const lines = readFileSync(join(dir, "checkpoint.jsonl"), "utf8").trim().split("\n");
    // Three triage candidates of round two, two runs each.
    expect(lines).toHaveLength(6);

    // Keep the first run and a line cut off mid-write, as after a stop.
    writeFileSync(join(dir, "checkpoint.jsonl"), `${lines[0]}\n${lines[1]!.slice(0, 40)}`);
    const resumed = await runBenchmarkCommand(
      parseBenchmarkArgs(["--dry-run", "--resume", first.BenchmarkId, "--out", out])!,
      {},
    );
    expect(resumed.BenchmarkId).toBe(first.BenchmarkId);
    expect(resumed.Summaries.map((s) => [s.Model, s.Runs.length, s.MeanPassRate])).toEqual(
      first.Summaries.map((s) => [s.Model, s.Runs.length, s.MeanPassRate]),
    );
    expect(resumed.Records.map((r) => r.Id)).toEqual(first.Records.map((r) => r.Id));
    expect(
      readFileSync(join(dir, "checkpoint.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.startsWith("{") && l.endsWith("}")),
    ).toHaveLength(6);
  });

  it("REQ-NFR-011: a round resumes only with the price table it started with", async () => {
    const out = mkdtempSync(join(tmpdir(), "roi-bench-"));
    dirs.push(out);
    const first = await runBenchmarkCommand(
      parseBenchmarkArgs([
        "--dry-run",
        "--step",
        "triage",
        "--runs",
        "1",
        "--limit",
        "1",
        "--out",
        out,
      ])!,
      {},
    );
    const older = join(REPO_ROOT_FOR_TEST, "infrastructure/cloudflare/prices/2026-11-06.json");
    await expect(
      runBenchmarkCommand(
        parseBenchmarkArgs([
          "--dry-run",
          "--resume",
          first.BenchmarkId,
          "--out",
          out,
          "--prices",
          older,
        ])!,
        {},
      ),
    ).rejects.toThrow(/price table 2026-11-11, not 2026-11-06/);
    await expect(
      runBenchmarkCommand(
        parseBenchmarkArgs(["--dry-run", "--resume", "bench-none", "--out", out])!,
        {},
      ),
    ).rejects.toThrow(/no round bench-none/);
  });

  it("REQ-NFR-003: a live run without credentials stops before any request", async () => {
    const args = parseBenchmarkArgs(["--runs", "1", "--limit", "1"])!;
    await expect(runBenchmarkCommand(args, {})).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });
});
