#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeWorkersAi, PriceTableSchema, type FakeReply } from "@roi/models";

import {
  loadExtractionSet,
  loadThreshold,
  loadTriageSet,
  type ExtractionEntry,
  type TriageEntry,
} from "../golden-set.js";
import { GatewayRestBinding, putR2Object } from "./gateway-binding.js";
import {
  formatBenchmarkMarkdown,
  runBenchmark,
  type BenchmarkPlan,
  type BenchmarkResult,
  type BenchmarkStep,
} from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../..");

/** Round one of the benchmark plan (ADR 0062). */
export const ROUND_ONE: Record<BenchmarkStep, string[]> = {
  triage: ["@cf/zai-org/glm-4.7-flash", "@cf/google/gemma-4-26b-a4b-it"],
  extraction: ["@cf/deepseek-ai/deepseek-v4.1-flash-1017", "@cf/google/gemma-4-26b-a4b-it"],
};

export const BENCHMARK_USAGE = [
  "Usage: roi-benchmark [--step triage|extraction|all] [--models <id,id>] [--runs <n>]",
  "                     [--budget-eur <n>] [--gateway <id>] [--out <dir>] [--limit <n>]",
  "                     [--output-mode json-schema|prompt-only] [--prices <file>]",
  "                     [--r2-bucket <name>] [--min-interval-ms <n>] [--dry-run]",
  "",
  "Live runs read CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI Read) from the",
  "environment. --dry-run answers with the golden-set labels and needs no credentials.",
].join("\n");

export type BenchmarkArgs = {
  Steps: BenchmarkStep[];
  Models: string[] | null;
  Runs: number;
  BudgetEur: number;
  Gateway: string;
  Out: string;
  Limit: number | null;
  OutputMode: "json-schema" | "prompt-only";
  Prices: string;
  R2Bucket: string | null;
  MinIntervalMs: number;
  DryRun: boolean;
};

function positive(value: string | undefined, integer: boolean): number | null {
  if (value === undefined) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) {
    return null;
  }
  return number;
}

/** The parsed arguments, or null when they do not match the usage. */
export function parseBenchmarkArgs(args: readonly string[]): BenchmarkArgs | null {
  const parsed: BenchmarkArgs = {
    Steps: ["triage", "extraction"],
    Models: null,
    Runs: 3,
    BudgetEur: 50,
    Gateway: "roi-staging",
    Out: "benchmark-out",
    Limit: null,
    OutputMode: "json-schema",
    Prices: join(REPO_ROOT, "infrastructure/cloudflare/prices/2026-11-06.json"),
    R2Bucket: null,
    MinIntervalMs: 3000,
    DryRun: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--dry-run") {
      parsed.DryRun = true;
      continue;
    }
    const value = args[i + 1];
    i += 1;
    if (value === undefined) {
      return null;
    }
    switch (flag) {
      case "--step":
        if (value === "all") {
          parsed.Steps = ["triage", "extraction"];
        } else if (value === "triage" || value === "extraction") {
          parsed.Steps = [value];
        } else {
          return null;
        }
        break;
      case "--models": {
        const models = value.split(",").map((m) => m.trim());
        if (models.some((m) => !m.startsWith("@cf/"))) {
          return null;
        }
        parsed.Models = models;
        break;
      }
      case "--runs": {
        const runs = positive(value, true);
        if (runs === null) return null;
        parsed.Runs = runs;
        break;
      }
      case "--budget-eur": {
        const budget = positive(value, false);
        if (budget === null) return null;
        parsed.BudgetEur = budget;
        break;
      }
      case "--limit": {
        const limit = positive(value, true);
        if (limit === null) return null;
        parsed.Limit = limit;
        break;
      }
      case "--min-interval-ms": {
        const ms = Number(value);
        if (!Number.isInteger(ms) || ms < 0) return null;
        parsed.MinIntervalMs = ms;
        break;
      }
      case "--gateway":
        parsed.Gateway = value;
        break;
      case "--out":
        parsed.Out = value;
        break;
      case "--prices":
        parsed.Prices = value;
        break;
      case "--r2-bucket":
        parsed.R2Bucket = value;
        break;
      case "--output-mode":
        if (value !== "json-schema" && value !== "prompt-only") return null;
        parsed.OutputMode = value;
        break;
      default:
        return null;
    }
  }
  if (parsed.Models !== null && parsed.Steps.length !== 1) {
    // Models are named per step; with --models choose one step.
    return null;
  }
  return parsed;
}

function labelReplies(
  steps: BenchmarkStep[],
  runs: number,
  modelsPerStep: Record<BenchmarkStep, string[]>,
  triage: TriageEntry[],
  extraction: ExtractionEntry[],
): FakeReply[] {
  const replies: FakeReply[] = [];
  for (const step of steps) {
    for (let m = 0; m < modelsPerStep[step].length * runs; m += 1) {
      if (step === "triage") {
        for (const entry of triage) {
          const s = entry.expected.signals;
          replies.push({
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
          });
        }
      } else {
        for (const entry of extraction) {
          replies.push({
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
              Notes:
                entry.expected.candidates.length === 0 ? (entry.expected.reason ?? "none") : null,
            },
          });
        }
      }
    }
  }
  return replies;
}

/** Runs a round and writes the report, summary, usage records, and raw responses to `Out`. */
export async function runBenchmarkCommand(
  args: BenchmarkArgs,
  env: Record<string, string | undefined>,
  options: { Fetch?: typeof fetch; Log?: (line: string) => void; Now?: () => Date } = {},
): Promise<BenchmarkResult> {
  const now = options.Now ?? (() => new Date());
  const prices = PriceTableSchema.parse(JSON.parse(readFileSync(args.Prices, "utf8")));
  const triage = loadTriageSet().slice(0, args.Limit ?? undefined);
  const extraction = loadExtractionSet().slice(0, args.Limit ?? undefined);
  const models: Record<BenchmarkStep, string[]> = {
    triage: args.Steps.includes("triage") ? (args.Models ?? ROUND_ONE.triage) : [],
    extraction: args.Steps.includes("extraction") ? (args.Models ?? ROUND_ONE.extraction) : [],
  };
  const benchmarkId = `bench-${now().toISOString().replace(/[:.]/gu, "-")}${args.DryRun ? "-dry" : ""}`;
  const plan: BenchmarkPlan = {
    BenchmarkId: benchmarkId,
    Steps: args.Steps,
    Models: models,
    Runs: args.Runs,
    OutputMode: args.OutputMode,
    BudgetEur: args.BudgetEur,
  };

  let ai;
  if (args.DryRun) {
    ai = new FakeWorkersAi(labelReplies(args.Steps, args.Runs, models, triage, extraction));
  } else {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
    ai = new GatewayRestBinding({
      AccountId: accountId,
      ApiToken: apiToken,
      MinIntervalMs: args.MinIntervalMs,
      TimeoutMs: 120_000,
      ...(options.Fetch ? { Fetch: options.Fetch } : {}),
    });
  }

  let id = 0;
  const result = await runBenchmark(
    plan,
    {
      Triage: { Entries: triage, Threshold: loadThreshold("triage") },
      Extraction: { Entries: extraction, Threshold: loadThreshold("extraction") },
    },
    {
      Ai: ai,
      GatewayId: args.Gateway,
      Prices: prices,
      MaxAttempts: 3,
      NewId: () => `${benchmarkId}-mc${(id += 1)}`,
      Now: now,
      Sleep: args.DryRun
        ? () => Promise.resolve()
        : (ms) => new Promise((done) => setTimeout(done, ms)),
      ...(options.Log ? { Log: options.Log } : {}),
    },
  );

  const outDir = join(args.Out, benchmarkId);
  mkdirSync(outDir, { recursive: true });
  const rawLines = result.Raw.map((call) => JSON.stringify(call)).join("\n");
  writeFileSync(join(outDir, "report.md"), formatBenchmarkMarkdown(result, plan));
  writeFileSync(
    join(outDir, "summary.json"),
    `${JSON.stringify(
      {
        Plan: plan,
        PriceTableVersion: prices.Version,
        TotalCostEur: result.TotalCostEur,
        BudgetReached: result.BudgetReached,
        Summaries: result.Summaries,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(outDir, "model-calls.jsonl"),
    result.Records.map((r) => JSON.stringify(r)).join("\n"),
  );
  writeFileSync(join(outDir, "raw-responses.jsonl"), rawLines);

  if (args.R2Bucket !== null && !args.DryRun) {
    // Raw responses go to R2 under a benchmark prefix, so a round can be graded again
    // without new model calls (benchmark plan, Method step 7).
    for (const [name, body] of [
      ["raw-responses.jsonl", rawLines],
      ["model-calls.jsonl", result.Records.map((r) => JSON.stringify(r)).join("\n")],
    ] as const) {
      await putR2Object({
        AccountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "",
        ApiToken: env.CLOUDFLARE_API_TOKEN?.trim() ?? "",
        Bucket: args.R2Bucket,
        Key: `benchmark/${benchmarkId}/${name}`,
        Body: body,
        ...(options.Fetch ? { Fetch: options.Fetch } : {}),
      });
    }
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseBenchmarkArgs(process.argv.slice(2));
  if (args === null) {
    console.error(BENCHMARK_USAGE);
    process.exitCode = 2;
    return;
  }
  try {
    const result = await runBenchmarkCommand(args, process.env, {
      Log: (line) => console.error(line),
    });
    console.log(
      `Benchmark ${result.BenchmarkId}: EUR ${result.TotalCostEur.toFixed(4)} spent, report in ${join(args.Out, result.BenchmarkId, "report.md")}`,
    );
    if (result.BudgetReached) {
      console.error("The budget was reached before the round finished; the report is incomplete.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
