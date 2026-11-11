#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  parseCandidate,
  runBenchmark,
  type BenchmarkPlan,
  type BenchmarkResult,
  type BenchmarkStep,
  type RunCheckpoint,
} from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../..");

/** Round one of the benchmark plan (ADR 0062). */
export const ROUND_ONE: Record<BenchmarkStep, string[]> = {
  triage: ["@cf/zai-org/glm-4.7-flash", "@cf/google/gemma-4-26b-a4b-it"],
  extraction: ["@cf/deepseek-ai/deepseek-v4.1-flash-1017", "@cf/google/gemma-4-26b-a4b-it"],
};

/**
 * Round two, the default (ADR 0086): the best candidate of round one per step, gpt-oss-120b,
 * and for triage Gemma with thinking off.
 */
export const ROUND_TWO: Record<BenchmarkStep, string[]> = {
  triage: [
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/google/gemma-4-26b-a4b-it+reasoning=off",
    "@cf/openai/gpt-oss-120b",
  ],
  extraction: ["@cf/deepseek-ai/deepseek-v4.1-flash-1017", "@cf/openai/gpt-oss-120b"],
};

export const BENCHMARK_USAGE = [
  "Usage: roi-benchmark [--step triage|extraction|all] [--models <id,id>] [--runs <n>]",
  "                     [--budget-eur <n>] [--gateway <id>] [--out <dir>] [--limit <n>]",
  "                     [--output-mode json-schema|prompt-only] [--prices <file>]",
  "                     [--r2-bucket <name>] [--min-interval-ms <n>] [--timeout-ms <n>]",
  "                     [--no-stream] [--dry-run]",
  "       roi-benchmark --resume <benchmark id> [--out <dir>] [--gateway <id>] [--prices <file>] ...",
  "",
  "Every finished run is appended to <out>/<benchmark id>/checkpoint.jsonl. --resume continues",
  "that round with its stored plan and skips the runs already finished; it takes no plan flags",
  "(--step, --models, --runs, --limit, --budget-eur, --output-mode).",
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
  /** Longest time one call may take, from request to the last streamed token. */
  TimeoutMs: number;
  /** Stream responses, so a slow reasoning model is not cut off by a proxy (ADR 0076). */
  Stream: boolean;
  DryRun: boolean;
  /** The benchmark ID of a stopped round to continue, or null for a new round. */
  Resume: string | null;
};

/** The plan of a round as stored next to its checkpoints, so `--resume` can continue it. */
export type StoredRun = {
  Plan: BenchmarkPlan;
  Limit: number | null;
  PriceTableVersion: string;
};

const PLAN_FLAGS = new Set([
  "--step",
  "--models",
  "--runs",
  "--limit",
  "--budget-eur",
  "--output-mode",
]);
const BENCHMARK_ID = /^bench-[0-9A-Za-z-]+$/u;

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
    Prices: join(REPO_ROOT, "infrastructure/cloudflare/prices/2026-11-11.json"),
    R2Bucket: null,
    MinIntervalMs: 3000,
    TimeoutMs: 600_000,
    Stream: true,
    DryRun: false,
    Resume: null,
  };
  let planFlags = false;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--dry-run") {
      parsed.DryRun = true;
      continue;
    }
    if (flag === "--no-stream") {
      parsed.Stream = false;
      continue;
    }
    const value = args[i + 1];
    i += 1;
    if (value === undefined) {
      return null;
    }
    if (flag !== undefined && PLAN_FLAGS.has(flag)) {
      planFlags = true;
    }
    switch (flag) {
      case "--resume":
        if (!BENCHMARK_ID.test(value)) return null;
        parsed.Resume = value;
        break;
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
        if (models.some((m) => parseCandidate(m) === null)) {
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
      case "--timeout-ms": {
        const ms = positive(value, true);
        if (ms === null) return null;
        parsed.TimeoutMs = ms;
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
  if (parsed.Resume !== null && planFlags) {
    // A resumed round keeps the plan it started with.
    return null;
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

  let stored: StoredRun;
  let resume: RunCheckpoint[] = [];
  if (args.Resume !== null) {
    const dir = join(args.Out, args.Resume);
    if (!existsSync(join(dir, "run.json"))) {
      throw new Error(`no round ${args.Resume} to resume in ${args.Out}`);
    }
    stored = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as StoredRun;
    if (stored.PriceTableVersion !== prices.Version) {
      throw new Error(
        `round ${args.Resume} uses price table ${stored.PriceTableVersion}, not ${prices.Version}`,
      );
    }
    const lines = existsSync(join(dir, "checkpoint.jsonl"))
      ? readFileSync(join(dir, "checkpoint.jsonl"), "utf8").split("\n")
      : [];
    // A line cut off by a stop mid-write is ignored; that run is simply run again.
    resume = lines.flatMap((line) => {
      if (line.trim() === "") return [];
      try {
        return [JSON.parse(line) as RunCheckpoint];
      } catch {
        return [];
      }
    });
  } else {
    const models: Record<BenchmarkStep, string[]> = {
      triage: args.Steps.includes("triage") ? (args.Models ?? ROUND_TWO.triage) : [],
      extraction: args.Steps.includes("extraction") ? (args.Models ?? ROUND_TWO.extraction) : [],
    };
    stored = {
      Plan: {
        BenchmarkId: `bench-${now().toISOString().replace(/[:.]/gu, "-")}${args.DryRun ? "-dry" : ""}`,
        Steps: args.Steps,
        Models: models,
        Runs: args.Runs,
        OutputMode: args.OutputMode,
        BudgetEur: args.BudgetEur,
      },
      Limit: args.Limit,
      PriceTableVersion: prices.Version,
    };
  }
  const plan = stored.Plan;
  const benchmarkId = plan.BenchmarkId;
  const models = plan.Models;
  const runs = plan.Runs;
  const triage = loadTriageSet().slice(0, stored.Limit ?? undefined);
  const extraction = loadExtractionSet().slice(0, stored.Limit ?? undefined);

  let ai;
  if (args.DryRun) {
    ai = new FakeWorkersAi(labelReplies(plan.Steps, runs, models, triage, extraction));
  } else {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
    ai = new GatewayRestBinding({
      AccountId: accountId,
      ApiToken: apiToken,
      MinIntervalMs: args.MinIntervalMs,
      TimeoutMs: args.TimeoutMs,
      Stream: args.Stream,
      ...(options.Fetch ? { Fetch: options.Fetch } : {}),
    });
  }

  // The round's folder is created only once the binding accepted the credentials, so a run
  // that cannot start leaves nothing behind.
  const outDir = join(args.Out, benchmarkId);
  mkdirSync(outDir, { recursive: true });
  if (args.Resume === null) {
    writeFileSync(join(outDir, "run.json"), `${JSON.stringify(stored, null, 2)}\n`);
  }

  // Record IDs continue after those of the resumed runs.
  let id = Math.max(
    0,
    ...resume.flatMap((c) => c.Records.map((r) => Number(/-mc(\d+)$/u.exec(r.Id)?.[1] ?? 0))),
  );
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
      Resume: resume,
      OnRunComplete: (checkpoint) => {
        appendFileSync(join(outDir, "checkpoint.jsonl"), `${JSON.stringify(checkpoint)}\n`);
      },
    },
  );

  const rawLines = result.Raw.map((call) => JSON.stringify(call)).join("\n");
  writeFileSync(join(outDir, "report.md"), formatBenchmarkMarkdown(result, plan));
  writeFileSync(
    join(outDir, "summary.json"),
    `${JSON.stringify(
      {
        Plan: plan,
        PriceTableVersion: prices.Version,
        Limit: stored.Limit,
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
