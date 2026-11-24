#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { runSlice } from "./run-slice.js";

/**
 * `pnpm --filter @roi/pipeline slice` (REQ-PROC-007 AC2, ADR 0117): runs the thin slice in this
 * process and prints the `slice` run report and the opportunity the read route returns. The data
 * stays in a new SQLite file under `.slice/`, so it can be inspected afterwards. Nothing is sent
 * over the network and no credential is read.
 */
function usage(): never {
  console.error("Usage: pnpm --filter @roi/pipeline slice [--start <ISO time>] [--db <new file>]");
  process.exit(2);
}

function parseArgs(argv: string[]): { Start?: string; Db?: string } {
  const parsed: { Start?: string; Db?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--start" && value !== undefined && !Number.isNaN(Date.parse(value))) {
      parsed.Start = new Date(value).toISOString();
      index += 1;
    } else if (flag === "--db" && value !== undefined) {
      parsed.Db = value;
      index += 1;
    } else {
      usage();
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/\D/gu, "").slice(0, 14);
  const path = args.Db ?? join(".slice", `slice-${stamp}.sqlite`);
  if (existsSync(path)) {
    console.error(`${path} exists; the slice needs a new database file`);
    process.exit(2);
  }
  mkdirSync(join(path, ".."), { recursive: true });
  const slice = await runSlice({
    DatabasePath: path,
    ...(args.Start ? { Start: args.Start } : {}),
  });
  slice.Database.Raw.close();
  console.log(
    JSON.stringify(
      {
        Database: path,
        Report: slice.Report,
        ReadRoute: {
          Request: `GET /api/v1/opportunities/${slice.OpportunityId}`,
          Status: slice.Response.Status,
          Body: slice.Response.Body,
        },
      },
      null,
      2,
    ),
  );
  if (slice.Response.Status !== 200) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
