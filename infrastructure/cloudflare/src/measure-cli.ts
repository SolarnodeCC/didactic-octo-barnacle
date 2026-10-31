#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCostAssumptions } from "./measure/estimate.js";
import { buildReport, collectMeasurements, formatMarkdown, type Row } from "./measure/report.js";

const ENVIRONMENTS = new Set(["preview", "staging", "production"]);

function usage(): never {
  console.error(
    "Usage: roi-measure --env <preview|staging|production> [--assumptions <file>] [--json-out <file>]",
  );
  process.exit(2);
}

/**
 * Wrangler may print warnings before the JSON. The result is a pretty-printed array whose
 * first line is a lone `[`, so start there; fall back to the whole output.
 */
export function parseWranglerRows(stdout: string): Row[] {
  const match = /^\[\s*$/m.exec(stdout);
  const body = match ? stdout.slice(match.index) : stdout;
  const parsed = JSON.parse(body) as Array<{ results?: Row[] }>;
  return parsed.flatMap((statement) => statement.results ?? []);
}

/**
 * `execFileSync` only says "Command failed" and keeps wrangler's own message in `stdout` and
 * `stderr`. Show that message, and say what to do when the tables are missing. Wrangler prints
 * the account only in its own output, so nothing secret is added here.
 */
export function describeWranglerFailure(error: unknown): string {
  const failure = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const output = [failure.stderr, failure.stdout]
    .map((part) => (typeof part === "string" ? part : Buffer.isBuffer(part) ? part.toString() : ""))
    .join("\n")
    .trim();
  const text = output || (typeof failure.message === "string" ? failure.message : String(error));
  const hint = /no such table/i.test(text)
    ? "\nThe database has no tables yet. Run the workflow `Staging deploy` with migrations on, then measure again."
    : "";
  return `Measuring failed. Wrangler said:\n${text}${hint}`;
}

function wranglerExecute(environment: string): (sql: string) => Promise<Row[]> {
  return (sql) => {
    let stdout: string;
    try {
      stdout = execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "DB",
          "--env",
          environment,
          "--remote",
          "--json",
          "--command",
          sql,
        ],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      throw new Error(describeWranglerFailure(error), { cause: error });
    }
    return Promise.resolve(parseWranglerRows(stdout));
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let environment: string | undefined;
  let assumptionsPath = "measure/cost-assumptions.json";
  let jsonOut: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--env" && value && ENVIRONMENTS.has(value)) {
      environment = value;
    } else if (args[i] === "--assumptions" && value) {
      assumptionsPath = value;
    } else if (args[i] === "--json-out" && value) {
      jsonOut = value;
    } else {
      usage();
    }
    i += 1;
  }
  if (!environment) {
    usage();
  }

  const assumptions = parseCostAssumptions(JSON.parse(readFileSync(assumptionsPath, "utf8")));
  const data = await collectMeasurements(wranglerExecute(environment));
  const report = buildReport(data, assumptions, new Date().toISOString());
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  }
  console.log(formatMarkdown(report));
}

if (process.argv[1]?.endsWith("measure-cli.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
