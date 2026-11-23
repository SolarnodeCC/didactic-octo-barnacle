import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeWorkersAi, PriceTableSchema, type FakeReply } from "@roi/models";
import { describe, expect, it } from "vitest";

import { formatRecallMarkdown, runRecall } from "./recall.js";

const here = dirname(fileURLToPath(import.meta.url));
const prices = PriceTableSchema.parse(
  JSON.parse(
    readFileSync(
      join(here, "../../../../infrastructure/cloudflare/prices/2026-11-11.json"),
      "utf8",
    ),
  ),
);

describe("REQ-PROC-003: the live recall command", () => {
  it("REQ-PROC-003 AC3: embeds the corpus in batches through the gateway and reports recall at 10 per query", async () => {
    const replies: FakeReply[] = Array.from({ length: 9 }, () => ({ Kind: "embedding" }));
    const ai = new FakeWorkersAi(replies);
    const run = await runRecall({
      Ai: ai,
      GatewayId: "roi-evals",
      Prices: prices,
      Model: "@cf/baai/bge-base-en-v1.5",
      RunId: "recall-test",
      Sleep: () => Promise.resolve(),
    });
    // 356 publications in batches of 50, then the 34 queries in one batch.
    expect(ai.Calls).toHaveLength(9);
    expect(ai.Calls.every((call) => call.Options.gateway.id === "roi-evals")).toBe(true);
    expect(run.Calls).toBe(9);
    expect(run.Report.Queries).toHaveLength(34);
    expect(run.Minimum).toBe(0.8);
    expect(run.Report.Recall).toBeGreaterThanOrEqual(0);
    expect(formatRecallMarkdown(run, "2026-11-23")).toContain(
      "# Recall at 10: `@cf/baai/bge-base-en-v1.5`",
    );
  });
});
