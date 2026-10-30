import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { upsertMappedRecord, type MappedRecord } from "./publication-repo.js";
import { mapArxivEntry } from "../collectors/arxiv/map-entry.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { mapOpenAlexWork } from "../collectors/openalex/map-work.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { counter, createTestDatabase, type TestDatabase } from "../test/sqlite-d1.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const NOW = "2026-10-29T12:00:00Z";

function openAlex(name: string, patch: Partial<OpenAlexWork> = {}): MappedRecord {
  const work = JSON.parse(readFileSync(join(fixtures, "openalex", name), "utf8")) as OpenAlexWork;
  return mapOpenAlexWork({ ...work, ...patch }, NOW);
}

function arxiv(patch: Partial<ArxivEntry> = {}): MappedRecord {
  const entry = JSON.parse(
    readFileSync(join(fixtures, "arxiv", "entry-cs-ai.json"), "utf8"),
  ) as ArxivEntry;
  return mapArxivEntry({ ...entry, ...patch }, NOW);
}

function count(database: TestDatabase, table: string): number {
  const row = database.Raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe("REQ-DATA-007: cross-source deduplication", () => {
  let database: TestDatabase;
  let deps: { Now: () => string; NewId: () => string };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
    );
    database = createTestDatabase();
    deps = { Now: () => NOW, NewId: counter() };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REQ-DATA-007: merges on DOI and keeps both source records linked", async () => {
    const first = await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    const second = await upsertMappedRecord(
      database.Db,
      arxiv({ id: "http://arxiv.org/abs/2409.99999v1", doi: "10.1000/OpenAlex.Example" }),
      deps,
    );

    expect(second.PublicationId).toBe(first.PublicationId);
    expect(count(database, "publication")).toBe(1);
    const sources = database.Raw.prepare(
      "SELECT source FROM source_record WHERE publication_id = ? ORDER BY source",
    ).all(first.PublicationId);
    expect(sources).toEqual([{ source: "arxiv" }, { source: "openalex" }]);
  });

  it("REQ-DATA-007: merges on arXiv ID when there is no DOI", async () => {
    await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    await upsertMappedRecord(database.Db, arxiv({ id: "http://arxiv.org/abs/2409.11111v3" }), deps);

    expect(count(database, "publication")).toBe(1);
    expect(count(database, "source_record")).toBe(2);
  });

  it("REQ-DATA-007: merges on a listed OpenAlex ID", async () => {
    await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    await upsertMappedRecord(
      database.Db,
      openAlex("work-complete.json", {
        id: "https://openalex.org/W1999",
        doi: null,
        ids: { openalex: "https://openalex.org/W1001" },
      }),
      deps,
    );

    expect(count(database, "publication")).toBe(1);
    expect(count(database, "source_record")).toBe(2);
  });

  it("REQ-DATA-007: flags a title and first author match for review and does not merge", async () => {
    const existing = await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    const incoming = await upsertMappedRecord(
      database.Db,
      arxiv({
        id: "http://arxiv.org/abs/2410.55555v1",
        title: "Software opportunities from clinical decision support!",
        authors: [{ name: "Ada Lovelace" }],
        doi: undefined as unknown as string,
      }),
      deps,
    );

    expect(incoming.ReviewFlagged).toBe(true);
    expect(incoming.PublicationId).not.toBe(existing.PublicationId);
    expect(count(database, "publication")).toBe(2);
    const reviews = database.Raw.prepare(
      "SELECT existing_publication_id, status FROM title_author_review",
    ).all();
    expect(reviews).toEqual([
      { existing_publication_id: existing.PublicationId, status: "pending" },
    ]);
  });

  it("REQ-DATA-007: does not flag a review for the same title with another first author", async () => {
    await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    const incoming = await upsertMappedRecord(
      database.Db,
      arxiv({
        id: "http://arxiv.org/abs/2410.55556v1",
        title: "Software opportunities from clinical decision support",
        authors: [{ name: "Someone Else" }],
        doi: undefined as unknown as string,
      }),
      deps,
    );
    expect(incoming.ReviewFlagged).toBe(false);
    expect(count(database, "title_author_review")).toBe(0);
  });

  it("REQ-DATA-007: an arXiv record does not overwrite the authors OpenAlex stored", async () => {
    await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    await upsertMappedRecord(database.Db, arxiv({ id: "http://arxiv.org/abs/2409.11111v3" }), deps);
    const authors = database.Raw.prepare(
      "SELECT a.display_name AS name FROM authorship s JOIN author a ON a.id = s.author_id",
    ).all();
    expect(authors).toEqual([{ name: "Ada Lovelace" }]);
  });
});

describe("REQ-DATA-001: repeated runs do not duplicate publications", () => {
  it("REQ-DATA-001: storing the same OpenAlex work twice changes nothing", async () => {
    const database = createTestDatabase();
    const deps = { Now: () => NOW, NewId: counter() };
    const first = await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);
    const second = await upsertMappedRecord(database.Db, openAlex("work-complete.json"), deps);

    expect(first.Outcome).toBe("created");
    expect(second.Outcome).toBe("unchanged");
    expect(second.PublicationId).toBe(first.PublicationId);
    for (const table of ["publication", "source_record", "author", "authorship"]) {
      expect(count(database, table), table).toBe(1);
    }
  });

  it("REQ-DATA-001: stores the work's authors, affiliations, topics, and citations", async () => {
    const database = createTestDatabase();
    await upsertMappedRecord(database.Db, openAlex("work-complete.json"), {
      Now: () => NOW,
      NewId: counter(),
    });
    const row = database.Raw.prepare(
      "SELECT p.citation_count, p.topics_json, a.orcid, s.affiliation FROM publication p JOIN authorship s ON s.publication_id = p.id JOIN author a ON a.id = s.author_id",
    ).get() as Record<string, unknown>;
    expect(row["citation_count"]).toBe(3);
    expect(row["orcid"]).toBe("0000-0001-2345-6789");
    expect(row["affiliation"]).toBe("Example University");
    expect(JSON.parse(row["topics_json"] as string)).toContain("Health informatics");
  });
});

describe("REQ-DATA-002: a new arXiv version updates the same publication", () => {
  it("REQ-DATA-002: v1 then v2 gives one row at version 2", async () => {
    const database = createTestDatabase();
    const deps = { Now: () => NOW, NewId: counter() };
    const v1 = await upsertMappedRecord(
      database.Db,
      arxiv({ id: "http://arxiv.org/abs/2409.22222v1" }),
      deps,
    );
    const v2 = await upsertMappedRecord(
      database.Db,
      arxiv({ id: "http://arxiv.org/abs/2409.22222v2", summary: "A revised abstract." }),
      deps,
    );

    expect(v2.PublicationId).toBe(v1.PublicationId);
    expect(count(database, "publication")).toBe(1);
    expect(count(database, "source_record")).toBe(1);
    const row = database.Raw.prepare("SELECT arxiv_version, abstract FROM publication").get();
    expect(row).toEqual({ arxiv_version: 2, abstract: "A revised abstract." });
  });
});

describe("REQ-DATA-005: incomplete publications are stored and marked", () => {
  it("REQ-DATA-005: a work without an abstract is stored incomplete with the missing field", async () => {
    const database = createTestDatabase();
    await upsertMappedRecord(database.Db, openAlex("work-no-abstract.json"), {
      Now: () => NOW,
      NewId: counter(),
    });
    const row = database.Raw.prepare(
      "SELECT completeness, missing_fields_json FROM publication",
    ).get() as { completeness: string; missing_fields_json: string };
    expect(row.completeness).toBe("incomplete");
    expect(JSON.parse(row.missing_fields_json)).toContain("Abstract");
  });

  it("REQ-DATA-005: a later source that supplies the abstract completes the publication", async () => {
    const database = createTestDatabase();
    const deps = { Now: () => NOW, NewId: counter() };
    await upsertMappedRecord(
      database.Db,
      openAlex("work-complete.json", { abstract_inverted_index: null }),
      deps,
    );
    await upsertMappedRecord(database.Db, arxiv({ id: "http://arxiv.org/abs/2409.11111v3" }), deps);
    const row = database.Raw.prepare("SELECT completeness FROM publication").get();
    expect(row).toEqual({ completeness: "complete" });
  });
});
