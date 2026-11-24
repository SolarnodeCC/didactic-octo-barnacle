#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LARGEST_MEASURED_DAY, runLoad } from "./run-load.js";

/**
 * `pnpm --filter @roi/pipeline load` (REQ-NFR-010, ADR 0118): runs a generated day of
 * publications through the real consumers on a virtual clock and prints the load report. It
 * calls no model and no network. The report is also written to `.load/`. The exit code is 1
 * when a verdict fails.
 */
function usage(): never {
  console.error("Usage: pnpm --filter @roi/pipeline load [--publications <n>] [--seed <n>]");
  process.exit(2);
}

function parseArgs(argv: string[]): { Publications: number; Seed: number } {
  const parsed = { Publications: LARGEST_MEASURED_DAY, Seed: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = Number(argv[index + 1]);
    if (flag === "--publications" && Number.isInteger(value) && value > 0 && value <= 20_000) {
      parsed.Publications = value;
      index += 1;
    } else if (flag === "--seed" && Number.isInteger(value)) {
      parsed.Seed = value;
      index += 1;
    } else {
      usage();
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const report = await runLoad(args);
  const output = { ...report, RealSeconds: Math.round((Date.now() - started) / 100) / 10 };
  mkdirSync(".load", { recursive: true });
  const path = join(".load", `load-${args.Publications}-${args.Seed}.json`);
  writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (!report.Passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
