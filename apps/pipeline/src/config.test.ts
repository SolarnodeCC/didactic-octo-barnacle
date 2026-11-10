import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_INGEST_CONFIG } from "./config.js";

const wrangler = readFileSync(
  new URL("../../../infrastructure/cloudflare/wrangler.toml", import.meta.url),
  "utf8",
);

describe("REQ-DATA-011: the PDF give-up point matches the document queue", () => {
  it("REQ-DATA-011: Pdf.MaxRetries equals max_retries of roi-documents in every environment", () => {
    // The consumer gives up on the delivery after the last retry (ADR 0073). If the two
    // numbers drift apart, PDFs are either dead-lettered again or given up too early.
    const consumers = [
      ...wrangler.matchAll(
        /queue = "roi-documents-(?!dlq-)[a-z]+"\n(?:[a-z_]+ = .*\n)*?max_retries = (\d+)/g,
      ),
    ];
    expect(consumers).toHaveLength(4);
    for (const consumer of consumers) {
      expect(Number(consumer[1])).toBe(DEFAULT_INGEST_CONFIG.Pdf.MaxRetries);
    }
  });
});
