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

import { EXPECTED_PHASE1_TABLES } from "./expected-schema.js";
import { applyMigrations, listMigrationFiles } from "./migrations.js";

function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe("REQ-NFR-020: migrations hold columns required by packages/models", () => {
  it("REQ-NFR-020: lists numbered SQL migrations in order", () => {
    expect(listMigrationFiles()[0]).toBe("0001_phase1_ingestion.sql");
  });

  it("REQ-NFR-020: applies migrations and exposes expected tables and columns", () => {
    const db = new Database(":memory:");
    const applied = applyMigrations((sql) => {
      db.exec(sql);
    });
    expect(applied).toEqual(["0001_phase1_ingestion.sql"]);

    for (const table of EXPECTED_PHASE1_TABLES) {
      const columns = tableColumns(db, table.name);
      for (const column of table.columns) {
        expect(columns, `${table.name}.${column}`).toContain(column);
      }
    }
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
        Type: "pdf-fetch",
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
