#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { parseCostAssumptions } from "./measure/estimate.js";
import { buildReport, collectMeasurements, formatMarkdown, type Row } from "./measure/report.js";

const ENVIRONMENTS = new Set(["preview", "staging", "production"]);

export const MEASURE_USAGE =
  "Usage: roi-measure --env <preview|staging|production> [--assumptions <file>] [--json-out <file>]";

export type MeasureArgs = { Environment: string; AssumptionsPath: string; JsonOut?: string };

/** The parsed arguments, or null when they do not match the usage line. */
export function parseMeasureArgs(args: readonly string[]): MeasureArgs | null {
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
      return null;
    }
    i += 1;
  }
  if (!environment) {
    return null;
  }
  return {
    Environment: environment,
    AssumptionsPath: assumptionsPath,
    ...(jsonOut ? { JsonOut: jsonOut } : {}),
  };
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

export type MeasureCliDeps = {
  /** Runs one read-only SQL statement against the environment's D1 database. */
  Execute?: (environment: string) => (sql: string) => Promise<Row[]>;
  ReadFile?: (path: string) => string;
  WriteFile?: (path: string, text: string) => void;
  Now?: () => string;
  Log: (line: string) => void;
  Error: (line: string) => void;
};

/** Runs the CLI and returns its exit code: 0 on success, 1 on failure, 2 on bad usage. */
export async function runMeasureCli(
  args: readonly string[],
  deps: MeasureCliDeps,
): Promise<number> {
  const parsed = parseMeasureArgs(args);
  if (!parsed) {
    deps.Error(MEASURE_USAGE);
    return 2;
  }
  try {
    const read = deps.ReadFile ?? ((path: string) => readFileSync(path, "utf8"));
    const assumptions = parseCostAssumptions(JSON.parse(read(parsed.AssumptionsPath)));
    const execute = (deps.Execute ?? wranglerExecute)(parsed.Environment);
    const data = await collectMeasurements(execute);
    const report = buildReport(data, assumptions, deps.Now?.() ?? new Date().toISOString());
    if (parsed.JsonOut) {
      (deps.WriteFile ?? writeFileSync)(parsed.JsonOut, JSON.stringify(report, null, 2));
    }
    deps.Log(formatMarkdown(report));
    return 0;
  } catch (error) {
    deps.Error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1]?.endsWith("measure-cli.js")) {
  void runMeasureCli(process.argv.slice(2), {
    Log: (line) => console.log(line),
    Error: (line) => console.error(line),
  }).then((code) => {
    process.exitCode = code;
  });
}
