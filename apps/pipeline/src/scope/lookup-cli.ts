#!/usr/bin/env node
import { writeFileSync } from "node:fs";

import { formatReport, runLookup } from "./lookup.js";
import { fetchWithBackoff } from "../http/retry.js";

/**
 * Manual, read-only lookup of the OpenAlex taxonomy for the topic map of
 * docs/kt/data-sources/ingestion-scope.md (REQ-DATA-001). It prints a Markdown report with
 * the subfield IDs and the volume per subfield. The key comes from `OPENALEX_API_KEY` and is
 * only sent in the Authorization header; it is never printed.
 */
function usage(): never {
  console.error("Usage: roi-scope-lookup [--days <1..365>] [--json-out <file>]");
  process.exit(2);
}

function parseArgs(argv: string[]): { Days: number; JsonOut?: string } {
  let days = 90;
  let jsonOut: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--days" && value !== undefined) {
      days = Number(value);
      index += 1;
    } else if (flag === "--json-out" && value !== undefined) {
      jsonOut = value;
      index += 1;
    } else {
      usage();
    }
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    usage();
  }
  return jsonOut === undefined ? { Days: days } : { Days: days, JsonOut: jsonOut };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env["OPENALEX_API_KEY"];
  if (!apiKey) {
    console.error("OPENALEX_API_KEY is not set. Add it as a secret of the GitHub environment.");
    process.exit(1);
  }

  const fromDate = new Date(Date.now() - args.Days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const report = await runLookup({
    Days: args.Days,
    FromDate: fromDate,
    FetchJson: async (url) => {
      const response = await fetchWithBackoff(
        fetch,
        url,
        { headers: { accept: "application/json", authorization: `Bearer ${apiKey}` } },
        { MaxAttempts: 3, BaseMs: 500, Sleep: (ms) => new Promise((done) => setTimeout(done, ms)) },
      );
      return response.json();
    },
  });

  process.stdout.write(formatReport(report));
  if (args.JsonOut) {
    writeFileSync(args.JsonOut, JSON.stringify(report, null, 2));
  }
}

main().catch((error: unknown) => {
  // The message of an HTTP error holds the URL and status, never the key.
  console.error(error instanceof Error ? error.message : "lookup failed");
  process.exit(1);
});
