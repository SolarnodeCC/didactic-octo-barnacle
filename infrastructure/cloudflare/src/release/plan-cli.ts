#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";

import { gatherPlanInput } from "./gather.js";
import { formatPlan, planRelease } from "./plan.js";

/**
 * Prints the weekly production release plan (REQ-NFR-020, ADR 0044). It only reads from GitHub
 * and git. `--output-file` receives `sha=<commit>` (empty when nothing is released), which is the
 * format of `$GITHUB_OUTPUT`.
 */
function usage(): never {
  console.error(
    "Usage: roi-release-plan [--soak-hours <n>] [--json-out <file>] [--output-file <file>]",
  );
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  let soakHours = 48;
  let jsonOut: string | undefined;
  let outputFile: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (value === undefined) usage();
    if (args[i] === "--soak-hours") soakHours = Number(value);
    else if (args[i] === "--json-out") jsonOut = value;
    else if (args[i] === "--output-file") outputFile = value;
    else usage();
  }
  if (!Number.isFinite(soakHours) || soakHours < 0) usage();
  const repo = process.env["GITHUB_REPOSITORY"];
  if (!repo) {
    console.error("GITHUB_REPOSITORY is not set (owner/repo).");
    process.exit(1);
  }

  const plan = planRelease(gatherPlanInput(repo, soakHours));
  process.stdout.write(formatPlan(plan));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(plan, null, 2));
  if (outputFile) appendFileSync(outputFile, `sha=${plan.Sha ?? ""}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "release plan failed");
  process.exit(1);
}
