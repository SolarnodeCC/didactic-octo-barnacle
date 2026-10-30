import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ingestArxivEntries, ingestOpenAlexWorks, type IngestDeps } from "./ingest-page.js";
import { parseArxivFeed } from "../collectors/arxiv/parse-feed.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { counter, createTestDatabase } from "../test/sqlite-d1.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function work(name: string): OpenAlexWork {
  return JSON.parse(readFileSync(join(fixtures, "openalex", name), "utf8")) as OpenAlexWork;
}

function setup() {
  const database = createTestDatabase();
  const deps: IngestDeps = {
    Db: database.Db,
    Now: () => "2026-10-29T12:00:00Z",
    NewId: counter(),
  };
  const rows = (table: string) =>
    (database.Raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { deps, rows };
}

describe("REQ-DATA-001: OpenAlex page ingestion", () => {
  it("REQ-DATA-001: one failing item is recorded and does not stop the page", async () => {
    const { deps, rows } = setup();
    const broken = { title: "No id" } as unknown as OpenAlexWork;
    const result = await ingestOpenAlexWorks(deps, [
      work("work-complete.json"),
      broken,
      work("work-no-abstract.json"),
    ]);

    expect(result.Counts).toEqual({
      Fetched: 3,
      Created: 2,
      Updated: 0,
      Skipped: 0,
      Failed: 1,
      DeadLettered: 0,
    });
    expect(result.Failures).toHaveLength(1);
    expect(rows("publication")).toBe(2);
  });

  it("REQ-DATA-001: a repeated run creates no duplicates and counts the items as skipped", async () => {
    const { deps, rows } = setup();
    const works = [work("work-complete.json"), work("work-no-abstract.json")];
    await ingestOpenAlexWorks(deps, works);
    const again = await ingestOpenAlexWorks(deps, works);

    expect(again.Counts).toMatchObject({ Created: 0, Updated: 0, Skipped: 2, Failed: 0 });
    expect(rows("publication")).toBe(2);
    expect(rows("source_record")).toBe(2);
  });
});

describe("REQ-DATA-002: arXiv page ingestion", () => {
  const feed = readFileSync(join(fixtures, "arxiv", "feed.xml"), "utf8");

  it("REQ-DATA-002: skips out-of-scope preprints and stores the rest", async () => {
    const { deps, rows } = setup();
    const result = await ingestArxivEntries(deps, parseArxivFeed(feed));

    expect(result.Counts).toMatchObject({ Fetched: 3, Created: 2, Skipped: 1, Failed: 0 });
    expect(rows("publication")).toBe(2);
  });

  it("REQ-DATA-002: a repeated run does not create duplicate preprints", async () => {
    const { deps, rows } = setup();
    const entries = parseArxivFeed(feed);
    await ingestArxivEntries(deps, entries);
    const again = await ingestArxivEntries(deps, entries);

    expect(again.Counts).toMatchObject({ Created: 0, Updated: 0, Skipped: 3 });
    expect(rows("publication")).toBe(2);
    expect(rows("source_record")).toBe(2);
  });
});
