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

describe("REQ-NFR-008: deployed Workers keep every log line and trace", () => {
  it.each(["staging", "production"])(
    "REQ-NFR-008: %s persists all logs and traces, redacts query strings (ADR 0121), and turns on issue detection",
    (environment) => {
      const table = `[env.${environment}.observability`;
      expect(wrangler).toContain(
        `${table}]\nenabled = true\nhead_sampling_rate = 1\nredact_query_string = true\n`,
      );
      expect(wrangler).toContain(
        `${table}.logs]\nenabled = true\nhead_sampling_rate = 1\ninvocation_logs = true\npersist = true\n`,
      );
      expect(wrangler).toContain(
        `${table}.traces]\nenabled = true\nhead_sampling_rate = 1\npersist = true\n`,
      );
      expect(wrangler).toContain(`${table}.issue_detection]\nenabled = true\n`);
    },
  );
});

describe("REQ-NFR-021: no deployed Worker keeps query strings in its traces (ADR 0121)", () => {
  it("REQ-NFR-021: no environment turns redaction of query strings off", () => {
    expect(wrangler).not.toMatch(/^redact_query_string\s*=\s*false/m);
  });
});

describe("REQ-DATA-006: text extraction has its own queue in every environment", () => {
  const environments = ["local", "preview", "staging", "production"];

  it.each(environments)(
    "REQ-DATA-006: %s binds TEXT_QUEUE and reads one PDF per invocation, with its own dead-letter queue",
    (environment) => {
      expect(wrangler).toContain(`binding = "TEXT_QUEUE"\nqueue = "roi-texts-${environment}"`);
      expect(wrangler).toContain(
        `queue = "roi-texts-${environment}"\nmax_batch_size = 1\nmax_concurrency = 3\nmax_retries = 3\ndead_letter_queue = "roi-texts-dlq-${environment}"`,
      );
      expect(wrangler).toContain(`queue = "roi-texts-dlq-${environment}"\nmax_batch_size = 1`);
    },
  );
});

describe("REQ-PROC-005: model steps have their own queue and Workers AI in every environment", () => {
  const environments = ["local", "preview", "staging", "production"];

  it.each(environments)(
    "REQ-PROC-005: %s binds MODEL_QUEUE with at most 8 messages in flight and its own dead-letter queue",
    (environment) => {
      expect(wrangler).toContain(`binding = "MODEL_QUEUE"\nqueue = "roi-models-${environment}"`);
      expect(wrangler).toContain(
        `queue = "roi-models-${environment}"\nmax_batch_size = 1\nmax_concurrency = 8\nmax_retries = 3\ndead_letter_queue = "roi-models-dlq-${environment}"`,
      );
      expect(wrangler).toContain(`queue = "roi-models-dlq-${environment}"\nmax_batch_size = 1`);
    },
  );

  it.each(environments)("REQ-NFR-003: %s binds Workers AI as AI", (environment) => {
    const table = environment === "local" ? "[ai]" : `[env.${environment}.ai]`;
    expect(wrangler).toContain(`${table}\nbinding = "AI"`);
  });
});

describe("REQ-PROC-001: embeddings have their own queue and the publication vectors in every environment", () => {
  const environments = ["local", "preview", "staging", "production"];

  it.each(environments)(
    "REQ-PROC-001: %s binds EMBEDDING_QUEUE with batches of 50, at most 2 at once, and its own dead-letter queue",
    (environment) => {
      expect(wrangler).toContain(
        `binding = "EMBEDDING_QUEUE"\nqueue = "roi-embeddings-${environment}"`,
      );
      expect(wrangler).toContain(
        `queue = "roi-embeddings-${environment}"\nmax_batch_size = 50\nmax_concurrency = 2\nmax_retries = 3\ndead_letter_queue = "roi-embeddings-dlq-${environment}"`,
      );
      expect(wrangler).toContain(`queue = "roi-embeddings-dlq-${environment}"\nmax_batch_size = 1`);
    },
  );

  it.each(environments)(
    "REQ-PROC-002: %s binds the Vectorize index as PUBLICATION_VECTORS",
    (environment) => {
      const table = environment === "local" ? "[[vectorize]]" : `[[env.${environment}.vectorize]]`;
      expect(wrangler).toContain(
        `${table}\nbinding = "PUBLICATION_VECTORS"\nindex_name = "roi-publications-${environment}"`,
      );
    },
  );
});

describe("REQ-PROC-005: the daily admission runs in the deployed environments", () => {
  it.each(["staging", "production"])(
    "REQ-PROC-005: %s triggers the admission at 11:00 UTC, after both ingestion crons, the recovery check every 30 minutes (REQ-DATA-012), and the retraction check on Monday 08:00 (REQ-DATA-008)",
    (environment) => {
      const section = wrangler.slice(wrangler.indexOf(`[env.${environment}.triggers]`));
      expect(section).toMatch(
        /^crons = \["0 6 \* \* \*", "30 7 \* \* \*", "0 8 \* \* 1", "0 11 \* \* \*", "\*\/30 \* \* \* \*"\]$/m,
      );
    },
  );
});

describe("REQ-PROC-007: the candidate Workflow of the thin slice", () => {
  it("REQ-PROC-007: local and preview bind CANDIDATE_WORKFLOW to the CandidateWorkflow class", () => {
    for (const [table, environment] of [
      ["[[workflows]]", "local"],
      ["[[env.preview.workflows]]", "preview"],
    ] as const) {
      expect(wrangler).toContain(
        `${table}\nname = "roi-candidate-${environment}"\nbinding = "CANDIDATE_WORKFLOW"\nclass_name = "CandidateWorkflow"`,
      );
    }
  });

  it("REQ-PROC-007: staging and production have no Workflow in phase 2 (ADR 0117)", () => {
    expect(wrangler).not.toMatch(/^\[\[env\.(staging|production)\.workflows\]\]/m);
  });
});

describe("REQ-NFR-010: processing in staging for the seven staging days (WP11)", () => {
  it("REQ-NFR-010: staging turns processing on and production leaves it off", () => {
    const staging = /^vars = \{ ENVIRONMENT = "staging",.*\}$/m.exec(wrangler)?.[0] ?? "";
    const production = /^vars = \{ ENVIRONMENT = "production",.*\}$/m.exec(wrangler)?.[0] ?? "";
    expect(staging).toContain('PROCESSING_ENABLED = "true"');
    expect(production).not.toContain("PROCESSING_ENABLED");
  });
});
