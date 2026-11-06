import { describe, expect, it } from "vitest";

import { ingestArxivEntries, ingestOpenAlexWorks } from "../ingest/ingest-page.js";
import { SCOPE_ARXIV_CATEGORIES, SCOPE_OPENALEX_TOPIC_NAMES } from "../normalize/scope.js";
import { createHarness, makeEntry, makeWork, type Harness } from "../test/harness.js";

const PAGE = 20;

/** Round trips per record for one page, counted the way D1 bills them (REQ-NFR-010). */
async function tripsPerRecord(h: Harness, ingest: () => Promise<unknown>): Promise<number> {
  const trips = h.Database.Trips;
  trips.Queries = 0;
  trips.Batches = 0;
  trips.BatchedStatements = 0;
  await ingest();
  return (trips.Queries + trips.Batches) / PAGE;
}

function ingestDeps(h: Harness) {
  const guard = h.Deps.AuthorGuard;
  return {
    Db: h.Deps.Db,
    Now: h.Deps.Now,
    NewId: h.Deps.NewId,
    ...(guard ? { SuppressedAuthors: (ids: string[]) => guard.Suppressed(ids) } : {}),
  };
}

const works = Array.from({ length: PAGE }, (_, i) => makeWork(i + 1));
/** The same papers on arXiv: they merge into the OpenAlex publications by DOI. */
const entries = Array.from({ length: PAGE }, (_, i) => ({
  ...makeEntry(i + 1, "2026-10-29T00:00:00Z"),
  doi: `10.1000/paper.${i + 1}`,
}));

describe("REQ-NFR-010: D1 round trips per stored record stay within budget", () => {
  it("REQ-NFR-010: new, refreshed, and merged records each use a bounded number of round trips", async () => {
    // A page of 100 records then stays far below the D1 limit of queries per invocation.
    const h = createHarness();
    const deps = ingestDeps(h);

    const created = await tripsPerRecord(h, () =>
      ingestOpenAlexWorks(deps, works, SCOPE_OPENALEX_TOPIC_NAMES),
    );
    const refreshed = await tripsPerRecord(h, () =>
      ingestOpenAlexWorks(deps, works, SCOPE_OPENALEX_TOPIC_NAMES),
    );
    const merged = await tripsPerRecord(h, () =>
      ingestArxivEntries(deps, entries, SCOPE_ARXIV_CATEGORIES),
    );

    // Before this budget they were 6, 6, and 11. A rise means a query was added per record.
    expect(created).toBeLessThanOrEqual(2.1);
    expect(refreshed).toBeLessThanOrEqual(4.1);
    expect(merged).toBeLessThanOrEqual(5.1);
    expect(h.Count("publication")).toBe(PAGE);
    expect(h.Count("source_record")).toBe(PAGE * 2);
  });
});
