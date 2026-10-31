import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { parseCostAssumptions, type CostAssumptions } from "./estimate.js";
import { MEASUREMENT_QUERIES } from "./queries.js";
import { buildReport, collectMeasurements, formatMarkdown, type Row } from "./report.js";
import { describeWranglerFailure, parseWranglerRows } from "../measure-cli.js";
import { applyMigrations } from "../migrations.js";

const NOW = "2026-10-30T12:00:00.000Z";
const assumptionsFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../measure/cost-assumptions.json",
);

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  applyMigrations((sql) => db.exec(sql));
  return db;
}

const counts = (created: number, failed = 0, dead = 0) =>
  JSON.stringify({
    Fetched: created + failed,
    Created: created,
    Updated: 0,
    Skipped: 0,
    Failed: failed,
    DeadLettered: dead,
  });

/**
 * Five publications: p1 and p2 from OpenAlex (one with a storable PDF), p3 from OpenAlex
 * without an abstract, p4 from arXiv, p5 found in both. Abstract lengths 400, 800, none,
 * 1200, 400.
 */
function seed(db: Database.Database): void {
  const publication = db.prepare(
    "INSERT INTO publication (id, title, abstract, published_at, completeness, has_storable_pdf, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const source = db.prepare(
    "INSERT INTO source_record (id, publication_id, source, source_work_id, fetched_at) VALUES (?, ?, ?, ?, ?)",
  );
  const add = (id: string, abstract: number | null, day: string, complete: boolean, pdf: boolean) =>
    publication.run(
      id,
      `Title ${id}`,
      abstract === null ? null : "x".repeat(abstract),
      day,
      complete ? "complete" : "incomplete",
      pdf ? 1 : 0,
      "2026-10-02T06:01:00.000Z",
      NOW,
    );
  add("p1", 400, "2026-10-01", true, true);
  add("p2", 800, "2026-10-01", true, false);
  add("p3", null, "2026-10-02", false, false);
  add("p4", 1200, "2026-10-02", true, false);
  add("p5", 400, "2026-10-02", true, false);
  source.run("s1", "p1", "openalex", "W1", NOW);
  source.run("s2", "p2", "openalex", "W2", NOW);
  source.run("s3", "p3", "openalex", "W3", NOW);
  source.run("s4", "p4", "arxiv", "2410.00004", NOW);
  source.run("s5", "p5", "openalex", "W5", NOW);
  source.run("s6", "p5", "arxiv", "2410.00005", NOW);

  const run = db.prepare(
    "INSERT INTO ingestion_run (id, source, started_at, ended_at, counts_json, failures_json, status, pages_done) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  run.run(
    "r1",
    "openalex",
    "2026-10-01T06:00:00.000Z",
    "2026-10-01T06:05:00.000Z",
    counts(4),
    "[]",
    "succeeded",
    2,
  );
  run.run(
    "r2",
    "openalex",
    "2026-10-02T06:00:00.000Z",
    "2026-10-02T06:03:00.000Z",
    counts(2),
    "[]",
    "succeeded",
    1,
  );
  run.run(
    "r3",
    "arxiv",
    "2026-10-02T07:30:00.000Z",
    "2026-10-02T07:40:00.000Z",
    counts(2, 1),
    '[{"SourceId":null,"Reason":"page cap of 50 reached; the next run covers the rest"}]',
    "partial",
    50,
  );
  run.run(
    "r4",
    "openalex",
    "2026-10-02T09:00:00.000Z",
    "2026-10-02T09:01:00.000Z",
    counts(0, 0, 1),
    "[]",
    "failed",
    0,
  );

  db.prepare(
    "INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, status, stored_at) VALUES ('d1', 'p1', 'pdfs/a.pdf', 'a', 'cc-by', 'stored', ?)",
  ).run(NOW);
  const message = db.prepare(
    "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, last_error, updated_at, created_at) VALUES (?, ?, ?, '1', ?, 1, ?, ?, ?, ?)",
  );
  message.run("m1", "document:p1", "document.ingest", "completed", 0, null, NOW, NOW);
  message.run(
    "m2",
    "document:p2",
    "document.ingest",
    "completed",
    0,
    "not-pdf: content type is not application/pdf",
    NOW,
    NOW,
  );
  message.run("m3", "document:p3", "document.ingest", "dead-lettered", 1, "HTTP 503", NOW, NOW);
  message.run(
    "m4",
    "fetch:r4:0",
    "source.fetch_page",
    "dead-lettered",
    1,
    "OpenAlex down",
    NOW,
    NOW,
  );

  db.prepare(
    "INSERT INTO title_author_review (id, review_key, incoming_source, incoming_source_work_id, existing_publication_id, created_at, updated_at) VALUES ('t1', 'k', 'arxiv', 'x', 'p1', ?, ?)",
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO alert_state (alert_key, issue_number, first_alerted_at, last_alerted_at, occurrences) VALUES ('dead-letter|staging|openalex', 42, ?, ?, 3)",
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO author_erasure (id, subject_hash, reason, erased_at) VALUES ('e1', ?, 'author-request', ?)",
  ).run("a".repeat(64), NOW);
}

const noPrices: CostAssumptions = parseCostAssumptions(
  JSON.parse(readFileSync(assumptionsFile, "utf8")),
);
const prices: CostAssumptions = {
  ...noPrices,
  triage: { ...noPrices.triage, inputEurPerMillionTokens: 1, outputEurPerMillionTokens: 2 },
  extraction: { ...noPrices.extraction, inputEurPerMillionTokens: 3, outputEurPerMillionTokens: 6 },
};

async function measure(db: Database.Database) {
  return collectMeasurements((sql) => Promise.resolve(db.prepare(sql).all() as Row[]));
}

describe("REQ-DATA-009: measuring ingestion volume", () => {
  it("REQ-DATA-009: every measurement is a single read-only SELECT", () => {
    for (const query of MEASUREMENT_QUERIES) {
      expect(query.Sql.trim().toUpperCase(), query.Name).toMatch(/^SELECT /);
      expect(query.Sql, query.Name).not.toMatch(/;\s*\S/);
      expect(query.Sql, query.Name).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
    }
  });

  it("REQ-DATA-009: counts runs and their outcomes per day and source", async () => {
    const db = freshDb();
    seed(db);
    const rows = (await measure(db)).runs_per_day;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      day: "2026-10-01",
      source: "openalex",
      runs: 1,
      succeeded: 1,
      created: 4,
      pages: 2,
      avg_seconds: 300,
    });
    expect(rows.find((r) => r["source"] === "arxiv")).toMatchObject({
      partial: 1,
      failed_items: 1,
      pages: 50,
    });
    expect(rows.find((r) => r["day"] === "2026-10-02" && r["source"] === "openalex")).toMatchObject(
      { runs: 2, succeeded: 1, failed: 1, dead_lettered: 1 },
    );
  });

  it("REQ-DATA-009: reports the daily volume per source by publication date", async () => {
    const db = freshDb();
    seed(db);
    const report = buildReport(await measure(db), noPrices, NOW);
    const openalex = report.Volume.find((v) => v.Source === "openalex");
    const arxiv = report.Volume.find((v) => v.Source === "arxiv");
    expect(openalex).toMatchObject({
      Days: 2,
      Total: 4,
      MeanPerDay: 2,
      MinPerDay: 2,
      MaxPerDay: 2,
    });
    expect(arxiv).toMatchObject({ Days: 1, Total: 2, MeanPerDay: 2 });
    expect(report.PublicationsPerDay).toBe(3); // day 1: 2, day 2: 4
  });

  it("REQ-DATA-009: reports abstract, completeness, and PDF shares per source", async () => {
    const db = freshDb();
    seed(db);
    const { Quality } = buildReport(await measure(db), noPrices, NOW);
    expect(Quality.find((q) => q.Source === "openalex")).toMatchObject({
      Publications: 4,
      WithAbstract: 3,
      Complete: 3,
      StorablePdf: 1,
      AvgAbstractChars: 533,
    });
    expect(Quality.find((q) => q.Source === "arxiv")).toMatchObject({
      Publications: 2,
      WithAbstract: 2,
      AvgAbstractChars: 800,
    });
  });

  it("REQ-DATA-009: reports PDF outcomes, dead letters, flagged duplicates, alerts, and erasures", async () => {
    const db = freshDb();
    seed(db);
    const report = buildReport(await measure(db), noPrices, NOW);
    expect(report.DocumentsByLicense).toEqual([{ License: "cc-by", Documents: 1 }]);
    expect(report.DocumentMessages).toEqual(
      expect.arrayContaining([
        { Status: "completed", Reason: "none", Messages: 1 },
        { Status: "completed", Reason: "not-pdf", Messages: 1 },
        { Status: "dead-lettered", Reason: "HTTP 503", Messages: 1 },
      ]),
    );
    expect(report.DeadLetters).toBe(2);
    expect(report.Overview).toMatchObject({
      Publications: 5,
      DuplicatesFlagged: 1,
      RunsStoppedByPageCap: 1,
      Alerts: 3,
      Erasures: 1,
    });
    expect(report.Runs).toEqual({ Total: 4, Succeeded: 2, Partial: 1, Failed: 1 });
  });

  it("REQ-DATA-009: the exit checks name what is still open", async () => {
    const db = freshDb();
    seed(db);
    const { Checks } = buildReport(await measure(db), noPrices, NOW);
    const met = Object.fromEntries(Checks.map((c) => [c.Name, c.Met]));
    expect(met["A scheduled run ingested publications from both sources"]).toBe(true);
    expect(met["No run ended failed and no message was dead-lettered"]).toBe(false);
    expect(met["Daily volume per source is measured"]).toBe(true);
    expect(met["The cost per publication estimate is complete (prices filled in)"]).toBe(false);
  });
});

describe("REQ-NFR-005: cost per publication is an estimate with stated assumptions", () => {
  it("REQ-NFR-005: without prices it shows token volumes and lists the missing prices", async () => {
    const db = freshDb();
    seed(db);
    const { Estimate } = buildReport(await measure(db), noPrices, NOW);
    // Weighted mean abstract: (533 × 3 + 800 × 2) / 5 = 639.8 characters, 4 characters per token.
    expect(Estimate.AvgAbstractTokens).toBeCloseTo(159.95, 2);
    expect(Estimate.Triage.InputTokens).toBeCloseTo(659.95, 2);
    expect(Estimate.Extraction.InputTokens).toBeCloseTo(1659.95, 2);
    expect(Estimate.PerPublicationEur).toBeNull();
    expect(Estimate.Complete).toBe(false);
    expect(Estimate.Missing).toEqual([
      "triage.inputEurPerMillionTokens",
      "triage.outputEurPerMillionTokens",
      "extraction.inputEurPerMillionTokens",
      "extraction.outputEurPerMillionTokens",
    ]);
  });

  it("REQ-NFR-005: with prices it computes the cost, the daily bound, and the provisional budget", async () => {
    const db = freshDb();
    seed(db);
    const { Estimate } = buildReport(await measure(db), prices, NOW);
    expect(Estimate.Triage.Eur).toBeCloseTo((659.95 * 1 + 100 * 2) / 1e6, 9);
    expect(Estimate.Extraction.Eur).toBeCloseTo((1659.95 * 3 + 800 * 6) / 1e6, 9);
    expect(Estimate.PerPublicationEur).toBeCloseTo(0.0106398, 7);
    // Three publications a day, all triaged and (below the limit of 100) all extracted.
    expect(Estimate.DailyUpperBoundEur).toBeCloseTo(3 * 0.00085995 + 3 * 0.00977985, 7);
    expect(Estimate.ProvisionalPhase2BudgetEur).toBeCloseTo(100 * 0.0106398 * 1.5, 5);
    expect(Estimate.Complete).toBe(true);
  });

  it("REQ-NFR-005: extraction in the daily bound is capped at the daily limit", async () => {
    const db = freshDb();
    seed(db);
    const capped = { ...prices, dailyExtractionLimit: 1 };
    const { Estimate } = buildReport(await measure(db), capped, NOW);
    expect(Estimate.DailyUpperBoundEur).toBeCloseTo(3 * 0.00085995 + 1 * 0.00977985, 7);
  });

  it("REQ-NFR-005: an empty database gives a report, not an error, and says what is missing", async () => {
    const report = buildReport(await measure(freshDb()), noPrices, NOW);
    expect(report.Overview.Publications).toBe(0);
    expect(report.PublicationsPerDay).toBeNull();
    expect(report.Estimate.Complete).toBe(false);
    expect(report.Estimate.Missing).toContain("abstracts (none stored yet)");
    expect(formatMarkdown(report)).toContain("n/a");
  });

  it("REQ-NFR-005: the report is labelled an estimate and marks missing prices", async () => {
    const db = freshDb();
    seed(db);
    const markdown = formatMarkdown(buildReport(await measure(db), noPrices, NOW));
    expect(markdown).toContain("Cost per publication (ESTIMATE, ADR 0032)");
    expect(markdown).toContain("**Incomplete:**");
    expect(markdown).toContain("run(s) stopped at the page cap");
    expect(markdown).toContain("- [x] A scheduled run ingested publications from both sources");
    expect(markdown).toContain("- [ ] The cost per publication estimate is complete");
  });

  it("REQ-NFR-005: the committed assumptions parse and carry no invented prices", () => {
    expect(noPrices.triage.inputEurPerMillionTokens).toBeNull();
    expect(noPrices.extraction.outputEurPerMillionTokens).toBeNull();
    expect(noPrices.dailyExtractionLimit).toBe(100);
  });

  it("REQ-NFR-005: assumptions that are not numbers or have negative values are refused", () => {
    const valid = JSON.parse(readFileSync(assumptionsFile, "utf8")) as Record<string, unknown>;
    expect(() => parseCostAssumptions({ ...valid, charsPerToken: 0 })).toThrow(/above 0/);
    expect(() => parseCostAssumptions({ ...valid, dailyExtractionLimit: "100" })).toThrow();
    expect(() =>
      parseCostAssumptions({
        ...valid,
        triage: { ...(valid["triage"] as object), promptTokens: -1 },
      }),
    ).toThrow(/promptTokens/);
    expect(() =>
      parseCostAssumptions({
        ...valid,
        triage: { ...(valid["triage"] as object), inputEurPerMillionTokens: "1" },
      }),
    ).toThrow(/inputEurPerMillionTokens/);
    expect(() => parseCostAssumptions(null)).toThrow();
  });
});

describe("REQ-NFR-020: reading wrangler output", () => {
  it("REQ-NFR-020: finds the JSON after warnings and ANSI codes", () => {
    const stdout = [
      "\u001b[33m▲ \u001b[43;33m[\u001b[43;30mWARNING\u001b[43;33m]\u001b[0m Proxy environment variables detected.",
      "",
      "[",
      "  {",
      '    "results": [{ "n": 1 }, { "n": 2 }],',
      '    "success": true',
      "  }",
      "]",
    ].join("\n");
    expect(parseWranglerRows(stdout)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("REQ-NFR-020: accepts plain JSON, several statements, and an empty result", () => {
    expect(parseWranglerRows('[{"results":[]}]')).toEqual([]);
    expect(parseWranglerRows('[{"results":[{"a":1}]},{"results":[{"a":2}]}]')).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it("REQ-NFR-020: shows wrangler's own error output when a query fails", () => {
    const error = Object.assign(new Error("Command failed: pnpm exec wrangler"), {
      stderr: "X [ERROR] some real cause",
      stdout: "",
    });
    const message = describeWranglerFailure(error);
    expect(message).toContain("some real cause");
    expect(message).not.toContain("Staging deploy");
  });

  it("REQ-NFR-020: tells the operator to run Staging deploy when the tables are missing", () => {
    const error = Object.assign(new Error("Command failed"), {
      stderr: "D1_ERROR: no such table: ingestion_run: SQLITE_ERROR",
    });
    expect(describeWranglerFailure(error)).toContain("Staging deploy");
  });
});
