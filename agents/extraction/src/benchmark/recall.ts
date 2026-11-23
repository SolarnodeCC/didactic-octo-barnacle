#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PriceTableSchema,
  callEmbedding,
  type CallModelDeps,
  type ModelCallRecord,
  type PriceTable,
  type WorkersAiBinding,
} from "@roi/models";
import { REFERENCE_EMBEDDING, evaluateRecall, type RecallReport } from "@roi/vector-store";
import { loadRecallCorpus, loadRecallThreshold } from "@roi/vector-store/recall-corpus";

import { GatewayRestBinding } from "./gateway-binding.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../..");
const CORPUS_DIR = join(REPO_ROOT, "packages/vector-store/fixtures/recall");

export type RecallRun = {
  Model: string;
  Report: RecallReport;
  Minimum: number;
  Passed: boolean;
  Calls: number;
  CostEur: number;
};

/**
 * The live recall at 10 of an embedding model on the corpus of ADR 0057 (REQ-PROC-003 AC3, the
 * WP5 exit): every publication and query is embedded through AI Gateway with `callEmbedding`,
 * and ranked by exact cosine. The same corpus serves the embedding benchmark of ADR 0010.
 */
export async function runRecall(options: {
  Ai: WorkersAiBinding;
  GatewayId: string;
  Prices: PriceTable;
  Model: string;
  RunId: string;
  CorpusDir?: string;
  Now?: () => Date;
  Sleep?: (ms: number) => Promise<void>;
}): Promise<RecallRun> {
  const dir = options.CorpusDir ?? CORPUS_DIR;
  const corpus = loadRecallCorpus(dir);
  const threshold = loadRecallThreshold(dir);
  const records: ModelCallRecord[] = [];
  let id = 0;
  const deps: CallModelDeps = {
    Ai: options.Ai,
    GatewayId: options.GatewayId,
    Usage: {
      budgetAllows: () => Promise.resolve(true),
      record: (record) => {
        records.push(record);
        return Promise.resolve();
      },
    },
    Prices: options.Prices,
    MaxAttempts: 3,
    NewId: () => `${options.RunId}-mc${(id += 1)}`,
    Now: options.Now ?? (() => new Date()),
    Sleep: options.Sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
  };
  const report = await evaluateRecall(corpus, async (texts) => {
    const result = await callEmbedding(deps, {
      RunKind: "processing",
      RunId: options.RunId,
      StepName: "recall",
      Model: options.Model,
      Texts: texts,
    });
    if (!result.Ok) {
      throw new Error(`embedding failed: ${result.Reason}`);
    }
    return result.Vectors;
  });
  return {
    Model: options.Model,
    Report: report,
    Minimum: threshold.minimum,
    Passed: report.Recall >= threshold.minimum,
    Calls: records.length,
    CostEur: records.reduce((sum, record) => sum + record.Cost.Amount, 0),
  };
}

/** A markdown report of a recall run, for the pull request that closes the WP5 exit. */
export function formatRecallMarkdown(run: RecallRun, date: string): string {
  return [
    `# Recall at 10: \`${run.Model}\``,
    "",
    `Measured on ${date} on the corpus of ADR 0057: ${run.Report.Queries.length} queries. Recall at 10 is **${run.Report.Recall.toFixed(3)}** against a minimum of ${run.Minimum}: ${run.Passed ? "passed" : "not passed"}. ${run.Calls} embedding calls, EUR ${run.CostEur.toFixed(5)}.`,
    "",
    "| Query | Relevant | Found in top 10 | Recall |",
    "|---|---|---|---|",
    ...run.Report.Queries.map(
      (q) => `| ${q.Id} | ${q.Relevant} | ${q.Found} | ${q.Recall.toFixed(2)} |`,
    ),
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: string) => {
    const at = args.indexOf(flag);
    return at === -1 ? fallback : (args[at + 1] ?? fallback);
  };
  try {
    const prices = PriceTableSchema.parse(
      JSON.parse(
        readFileSync(
          value("--prices", join(REPO_ROOT, "infrastructure/cloudflare/prices/2026-11-11.json")),
          "utf8",
        ),
      ),
    );
    const model = value("--model", REFERENCE_EMBEDDING.Model);
    const now = new Date();
    const run = await runRecall({
      Ai: new GatewayRestBinding({
        AccountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "",
        ApiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "",
        MinIntervalMs: Number(value("--min-interval-ms", "0")),
        TimeoutMs: Number(value("--timeout-ms", "60000")),
      }),
      GatewayId: value("--gateway", "roi-evals"),
      Prices: prices,
      Model: model,
      RunId: `recall-${now.toISOString().replace(/[-:.]/gu, "")}`,
    });
    const markdown = formatRecallMarkdown(run, now.toISOString().slice(0, 10));
    const out = value("--out", "");
    if (out !== "") {
      writeFileSync(out, markdown);
    }
    console.log(markdown);
    process.exitCode = run.Passed ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
