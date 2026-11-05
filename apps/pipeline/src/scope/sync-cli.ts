#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import { OPENALEX_SUBFIELD_IDS } from "../normalize/scope.js";
import type { LookupReport } from "./lookup.js";
import { applySubfieldChanges, formatSyncPlan, planSubfieldSync } from "./sync.js";

/**
 * Reads the JSON report of `roi-scope-lookup --json-out` and, when an OpenAlex subfield ID
 * of a name already in the topic map changed, rewrites that ID in the given source file
 * (REQ-DATA-001). It prints a Markdown summary. It makes no network request.
 */
function usage(): never {
  console.error("Usage: roi-scope-sync --report <scope.json> --source <normalize/scope.ts>");
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  let reportPath: string | undefined;
  let sourcePath: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1];
    if (value === undefined) usage();
    if (args[index] === "--report") reportPath = value;
    else if (args[index] === "--source") sourcePath = value;
    else usage();
  }
  if (!reportPath || !sourcePath) usage();

  const report = JSON.parse(readFileSync(reportPath, "utf8")) as LookupReport;
  const plan = planSubfieldSync(report, OPENALEX_SUBFIELD_IDS);
  if (plan.Changes.length > 0) {
    writeFileSync(sourcePath, applySubfieldChanges(readFileSync(sourcePath, "utf8"), plan.Changes));
  }
  process.stdout.write(formatSyncPlan(plan));
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "sync failed");
  process.exit(1);
}
