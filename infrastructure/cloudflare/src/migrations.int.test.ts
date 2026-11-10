import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  PublicationSchema,
  SourceRecordSchema,
  AuthorSchema,
  AuthorshipSchema,
  DocumentSchema,
  IngestionRunSchema,
  QueueMessageLogSchema,
} from "@roi/models";

import { EXPECTED_PHASE1_TABLES, EXPECTED_PHASE2_TABLES } from "./expected-schema.js";
import { applyMigrations, listMigrationFiles, readMigrationSql } from "./migrations.js";

function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe("REQ-NFR-020: migrations hold columns required by packages/models", () => {
  it("REQ-NFR-020: lists numbered SQL migrations in order", () => {
    expect(listMigrationFiles()).toEqual([
      "0001_init.sql",
      "0002_title_author_review.sql",
      "0003_publication_title_author_key.sql",
      "0004_ingestion_run_state.sql",
      "0005_alert_state.sql",
      "0006_author_erasure.sql",
      "0007_ingestion_run_window_end.sql",
      "0008_source_record_openalex_lower_idx.sql",
      "0009_processing.sql",
      "0010_model_call_cached_input_tokens.sql",
    ]);
  });

  it("REQ-NFR-020: applies migrations and exposes expected tables and columns", () => {
    const db = new Database(":memory:");
    const applied = applyMigrations((sql) => {
      db.exec(sql);
    });
    expect(applied).toEqual([
      "0001_init.sql",
      "0002_title_author_review.sql",
      "0003_publication_title_author_key.sql",
      "0004_ingestion_run_state.sql",
      "0005_alert_state.sql",
      "0006_author_erasure.sql",
      "0007_ingestion_run_window_end.sql",
      "0008_source_record_openalex_lower_idx.sql",
      "0009_processing.sql",
      "0010_model_call_cached_input_tokens.sql",
    ]);

    for (const table of [...EXPECTED_PHASE1_TABLES, ...EXPECTED_PHASE2_TABLES]) {
      const columns = tableColumns(db, table.name);
      for (const column of table.columns) {
        expect(columns, `${table.name}.${column}`).toContain(column);
      }
    }
  });

  it("REQ-NFR-020: enforces one document per publication and one record per source work", () => {
    const db = new Database(":memory:");
    applyMigrations((sql) => {
      db.exec(sql);
    });
    const now = "2026-10-29T12:00:00Z";
    db.prepare(
      "INSERT INTO publication (id, title, completeness, created_at, updated_at) VALUES (?, ?, 'incomplete', ?, ?)",
    ).run("pub_1", "Title", now, now);
    const insertDocument = db.prepare(
      "INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, stored_at) VALUES (?, 'pub_1', 'k', ?, 'cc-by', ?)",
    );
    insertDocument.run("doc_1", "hash_1", now);
    expect(() => insertDocument.run("doc_2", "hash_2", now)).toThrow(/UNIQUE/);

    const insertSource = db.prepare(
      "INSERT INTO source_record (id, publication_id, source, source_work_id, fetched_at) VALUES (?, 'pub_1', 'arxiv', 'w1', ?)",
    );
    insertSource.run("src_1", now);
    expect(() => insertSource.run("src_2", now)).toThrow(/UNIQUE/);
  });

  it("REQ-NFR-020: contracts still parse sample rows shaped for the migrated schema", () => {
    const now = "2026-10-29T12:00:00Z";
    expect(
      PublicationSchema.parse({
        Id: "pub_1",
        Title: "Title",
        Abstract: "Abstract",
        PublicationDate: "2026-10-01",
        Doi: null,
        ArxivId: "2401.12345",
        ArxivVersion: null,
        Topics: ["cs.AI"],
        CitationCount: 0,
        Completeness: "complete",
        MissingFields: [],
        RetractionFlag: false,
        Language: "en",
        HasStorablePdf: false,
        CreatedAt: now,
        UpdatedAt: now,
      }).Id,
    ).toBe("pub_1");

    expect(
      SourceRecordSchema.parse({
        Id: "src_1",
        PublicationId: "pub_1",
        Source: "arxiv",
        SourceId: "2401.12345",
        FetchedAt: now,
        MetadataLicense: "cc0",
        OpenAccessUrl: null,
        PdfUrl: null,
        PdfLicense: null,
      }).Source,
    ).toBe("arxiv");

    expect(AuthorSchema.parse({ Id: "a1", DisplayName: "Ada", Orcid: null }).DisplayName).toBe(
      "Ada",
    );
    expect(
      AuthorshipSchema.parse({
        PublicationId: "pub_1",
        AuthorId: "a1",
        Position: 0,
        Affiliations: [],
      }).Position,
    ).toBe(0);
    expect(
      DocumentSchema.parse({
        Id: "doc_1",
        PublicationId: "pub_1",
        ContentHash: "abc",
        StorageKey: "pdfs/abc.pdf",
        License: "cc-by",
        ExtractedTextKey: null,
        ExtractorVersion: null,
        StoredAt: now,
      }).License,
    ).toBe("cc-by");
    expect(
      IngestionRunSchema.parse({
        Id: "run_1",
        Source: "openalex",
        Cursor: null,
        Status: "succeeded",
        StartedAt: now,
        EndedAt: now,
        Counts: {
          Fetched: 1,
          Created: 1,
          Updated: 0,
          Skipped: 0,
          Failed: 0,
          DeadLettered: 0,
        },
        Failures: [],
      }).Status,
    ).toBe("succeeded");
    expect(
      QueueMessageLogSchema.parse({
        MessageId: "m1",
        Type: "source.fetch_page",
        SchemaVersion: "1",
        Status: "completed",
        Attempts: 1,
        DeadLetter: false,
        LastError: null,
        CreatedAt: now,
        UpdatedAt: now,
      }).DeadLetter,
    ).toBe(false);
  });
});

describe("REQ-NFR-010: deduplication lookups use an index", () => {
  it("REQ-NFR-010: the case-insensitive OpenAlex ID lookup does not scan source_record", () => {
    const db = new Database(":memory:");
    applyMigrations((sql) => {
      db.exec(sql);
    });
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT publication_id FROM source_record WHERE source = 'openalex' AND lower(source_work_id) IN (?, ?)",
      )
      .all("w1", "w2") as Array<{ detail: string }>;
    const details = plan.map((row) => row.detail).join("\n");
    expect(details).toContain("source_record_openalex_lower_idx");
    expect(details).not.toMatch(/SCAN source_record/);
  });
});

function migratedDb(): Database.Database {
  const db = new Database(":memory:");
  applyMigrations((sql) => {
    db.exec(sql);
  });
  return db;
}

describe("REQ-NFR-020: migration 0009 is expand-only", () => {
  it("REQ-NFR-020: 0009 applies on top of 0008 with data, and phase 1 queries still run", () => {
    const db = new Database(":memory:");
    for (const file of listMigrationFiles().filter((name) => name < "0009")) {
      db.exec(readMigrationSql(file));
    }
    const now = "2026-11-07T12:00:00Z";
    db.prepare(
      "INSERT INTO publication (id, title, completeness, created_at, updated_at) VALUES ('pub_1', 'Title', 'complete', ?, ?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, stored_at) VALUES ('doc_1', 'pub_1', 'k', 'h', 'cc-by', ?)",
    ).run(now);

    db.exec(readMigrationSql("0009_processing.sql"));

    // The phase 1 Worker writes and reads with its own column lists; the new columns are empty.
    db.prepare(
      "INSERT INTO publication (id, title, completeness, created_at, updated_at) VALUES ('pub_2', 'Other', 'incomplete', ?, ?)",
    ).run(now, now);
    const rows = db
      .prepare("SELECT id, retraction_handled_at FROM publication ORDER BY id")
      .all() as Array<{ id: string; retraction_handled_at: string | null }>;
    expect(rows).toEqual([
      { id: "pub_1", retraction_handled_at: null },
      { id: "pub_2", retraction_handled_at: null },
    ]);
    db.prepare(
      "UPDATE document SET status = 'text-failed', failure_reason = 'empty' WHERE id = 'doc_1'",
    ).run();
    expect(db.prepare("SELECT status FROM document WHERE id = 'doc_1'").get()).toEqual({
      status: "text-failed",
    });
  });
});

describe("REQ-NFR-020: migration 0010 is expand-only", () => {
  it("REQ-NFR-020: REQ-NFR-011 0010 adds cached_input_tokens on top of 0009 with data, and the 0009 insert still runs", () => {
    const db = new Database(":memory:");
    for (const file of listMigrationFiles().filter((name) => name < "0010")) {
      db.exec(readMigrationSql(file));
    }
    const insert0009 = db.prepare(
      "INSERT INTO model_call (id, run_kind, run_id, step_name, model, attempt, input_tokens, cost_currency, outcome, created_at) VALUES (?, 'processing', 'run_1', 'triage', 'm', 1, 900, 'EUR', 'ok', '2026-11-10T12:00:00Z')",
    );
    insert0009.run("mc_1");

    db.exec(readMigrationSql("0010_model_call_cached_input_tokens.sql"));

    // A Worker of the previous version writes without the column; the row reads as uncached.
    insert0009.run("mc_2");
    expect(db.prepare("SELECT id, cached_input_tokens FROM model_call ORDER BY id").all()).toEqual([
      { id: "mc_1", cached_input_tokens: 0 },
      { id: "mc_2", cached_input_tokens: 0 },
    ]);
  });

  it("REQ-NFR-011: AC1 cached input tokens are a non-negative part of the input tokens", () => {
    const db = migratedDb();
    const insert = db.prepare(
      "INSERT INTO model_call (id, run_kind, run_id, step_name, model, attempt, input_tokens, cached_input_tokens, cost_currency, outcome, created_at) VALUES (?, 'processing', 'run_1', 'extraction', 'm', 1, 1027, ?, 'EUR', 'ok', '2026-11-10T12:00:00Z')",
    );
    insert.run("mc_1", 960);
    insert.run("mc_2", 1027);
    expect(() => insert.run("mc_3", 1028)).toThrow(/CHECK/);
    expect(() => insert.run("mc_4", -1)).toThrow(/CHECK/);
  });
});

describe("REQ-NFR-011: model_call holds usage, never text", () => {
  it("REQ-NFR-011: AC3 model_call has no column for prompt, output, or publication text", () => {
    const db = migratedDb();
    const columns = tableColumns(db, "model_call");
    for (const forbidden of [
      "prompt",
      "prompt_text",
      "output",
      "output_json",
      "abstract",
      "text",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("REQ-NFR-011: AC1 rejects an unknown outcome and an attempt below one", () => {
    const db = migratedDb();
    const insert = db.prepare(
      "INSERT INTO model_call (id, run_kind, run_id, step_name, model, attempt, cost_currency, outcome, created_at) VALUES (?, 'processing', 'run_1', 'triage', 'm', ?, 'USD', ?, '2026-11-07T12:00:00Z')",
    );
    insert.run("mc_1", 1, "ok");
    expect(() => insert.run("mc_2", 0, "ok")).toThrow(/CHECK/);
    expect(() => insert.run("mc_3", 1, "timeout")).toThrow(/CHECK/);
  });
});

describe("REQ-PROC-006: one triage decision and one daily processing run", () => {
  it("REQ-PROC-006: a publication is triaged once, and a daily run is unique per day", () => {
    const db = migratedDb();
    const now = "2026-11-07T12:00:00Z";
    db.prepare(
      "INSERT INTO publication (id, title, completeness, created_at, updated_at) VALUES ('pub_1', 'Title', 'complete', ?, ?)",
    ).run(now, now);
    const decide = db.prepare(
      "INSERT INTO triage_decision (id, publication_id, run_id, status, reason, created_at, updated_at) VALUES (?, 'pub_1', 'run_1', 'decided', 'out-of-scope', ?, ?)",
    );
    decide.run("td_1", now, now);
    expect(() => decide.run("td_2", now, now)).toThrow(/UNIQUE/);

    const run = db.prepare(
      "INSERT INTO processing_run (id, kind, day, status, started_at) VALUES (?, ?, '2026-11-07', 'running', ?)",
    );
    run.run("run_1", "daily", now);
    expect(() => run.run("run_2", "daily", now)).toThrow(/UNIQUE/);
    run.run("run_3", "backfill", now);
    run.run("run_4", "backfill", now);
  });
});

describe("REQ-PROC-001: at most one current embedding index", () => {
  it("REQ-PROC-001: a second current index is refused", () => {
    const db = migratedDb();
    const insert = db.prepare(
      "INSERT INTO embedding_index (id, binding, vectorize_name, model_name, model_version, dimensions, metric, current) VALUES (?, ?, ?, 'bge-base-en-v1.5', '1', 768, 'cosine', ?)",
    );
    insert.run("ix_1", "PUBLICATION_VECTORS", "roi-publications-local", 1);
    insert.run("ix_2", "PUBLICATION_VECTORS_NEXT", "roi-publications-next-local", 0);
    expect(() =>
      insert.run("ix_3", "PUBLICATION_VECTORS_OTHER", "roi-publications-other-local", 1),
    ).toThrow(/UNIQUE/);
  });
});
