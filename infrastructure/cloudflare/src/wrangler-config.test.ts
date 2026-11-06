import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("REQ-NFR-021: Worker exposure", () => {
  it("REQ-NFR-021: turns off workers.dev and preview URLs for every environment", () => {
    expect(wrangler).toMatch(/^workers_dev\s*=\s*false$/m);
    expect(wrangler).toMatch(/^preview_urls\s*=\s*false$/m);
    expect(wrangler).not.toMatch(/^\s*(workers_dev|preview_urls)\s*=\s*true/m);
  });

  it("REQ-NFR-021: sets both flags before the first table, so every environment inherits them", () => {
    const firstTable = wrangler.search(/^\[/m);
    expect(wrangler.search(/^workers_dev\s*=/m)).toBeLessThan(firstTable);
    expect(wrangler.search(/^preview_urls\s*=/m)).toBeLessThan(firstTable);
  });
});

describe("REQ-DATA-004: PDF downloads have their own queue in every environment", () => {
  const environments = ["local", "preview", "staging", "production"];

  it.each(environments)(
    "REQ-DATA-004: %s binds DOCUMENT_QUEUE and consumes it with its own dead-letter queue",
    (environment) => {
      expect(wrangler).toContain(
        `binding = "DOCUMENT_QUEUE"\nqueue = "roi-documents-${environment}"`,
      );
      expect(wrangler).toContain(
        `queue = "roi-documents-${environment}"\nmax_batch_size = 5\nmax_concurrency = 5\nmax_retries = 3\ndead_letter_queue = "roi-documents-dlq-${environment}"`,
      );
      expect(wrangler).toContain(`queue = "roi-documents-dlq-${environment}"\nmax_batch_size = 1`);
    },
  );

  it.each(environments)(
    "REQ-DATA-009: %s keeps one page at a time, so pages are stored in order",
    (environment) => {
      expect(wrangler).toContain(
        `queue = "roi-publications-${environment}"\nmax_batch_size = 1\nmax_concurrency = 1`,
      );
    },
  );
});
