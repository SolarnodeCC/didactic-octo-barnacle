import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARXIV_IDS_PER_PAGE, retractionRunId, startRetractionCheck } from "./check.js";
import { mapArxivEntry } from "../collectors/arxiv/map-entry.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { mapOpenAlexWork } from "../collectors/openalex/map-work.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { ADMISSION_CRON, RETRACTION_CRON } from "../config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { upsertMappedRecord } from "../store/publication-repo.js";
import { createHarness, openAlexPage, type Harness } from "../test/harness.js";
import { counter } from "../test/sqlite-d1.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function fixture<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(fixtures, ...path), "utf8")) as T;
}

/** The recorded `is_retracted:true` page (ADR 0112), as the client returns it. */
function retractedPage(): OpenAlexWork[] {
  return fixture<{ results: OpenAlexWork[] }>("openalex", "page-retracted.json").results;
}

const ENTRY = fixture<ArxivEntry>("arxiv", "entry-cs-ai.json");

function arxivEntry(n: number, patch: Partial<ArxivEntry> = {}): ArxivEntry {
  const id = `2409.${String(n).padStart(5, "0")}`;
  return {
    ...ENTRY,
    id: `http://arxiv.org/abs/${id}v1`,
    doi: `10.48550/arXiv.${id}`,
    title: `Preprint number ${n}`,
    ...patch,
  };
}

/** Stores records as ingestion would, the day before the check. */
async function store(
  h: Harness,
  storedAt: string,
  records: Parameters<typeof upsertMappedRecord>[1][],
) {
  const ids = counter("pub");
  for (const record of records) {
    await upsertMappedRecord(h.Database.Db, record, { Now: () => storedAt, NewId: ids });
  }
}

function retracted(h: Harness): number[] {
  return (
    h.Database.Raw.prepare(
      "SELECT retracted FROM publication ORDER BY created_at, id",
    ).all() as Array<{
      retracted: number;
    }>
  ).map((row) => row.retracted);
}

function run(h: Harness, day: string) {
  return h.Database.Raw.prepare(
    "SELECT kind, status, counts_json, ended_at FROM processing_run WHERE id = ?",
  ).get(retractionRunId(day)) as
    { kind: string; status: string; counts_json: string; ended_at: string | null } | undefined;
}

describe("REQ-DATA-008: the weekly retraction check", () => {
  it("REQ-DATA-008 AC1 AC2: a stored work OpenAlex now marks as retracted is flagged, and the next sweep hides its candidates", async () => {
    const h = createHarness();
    const work = fixture<OpenAlexWork>("openalex", "work-retracted.json");
    await store(h, "2023-06-11T06:00:00.000Z", [
      mapOpenAlexWork({ ...work, is_retracted: false }, "2023-06-11T06:00:00.000Z"),
    ]);
    const [publication] = h.Database.Raw.prepare("SELECT id FROM publication").all() as Array<{
      id: string;
    }>;
    h.Database.Raw.prepare(
      `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
         confidence, notes, candidate_count, created_at)
       VALUES ('ext_1', ?, 'run_seed', 'm', 'extraction@4', 'abstract', 0.6, NULL, 1, '2023-06-11T07:00:00.000Z')`,
    ).run(publication?.id);
    h.Database.Raw.prepare(
      `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
         customer, customer_quote, created_at)
       VALUES ('cand_1', ?, 'ext_1', 'A finding.', 'A quote.', 'agencies', 'Agencies', '2023-06-11T07:00:00.000Z')`,
    ).run(publication?.id);
    h.SetOpenAlexPages([openAlexPage(retractedPage(), null)]);

    h.Clock.Now = "2023-06-12T08:00:00.000Z";
    await runScheduled(h.Deps, RETRACTION_CRON);
    await h.Drain();

    expect(retracted(h)).toEqual([1]);
    expect(h.OpenAlexRequests[0]).toMatchObject({
      FromDate: "2023-05-13",
      ToDate: "2023-06-12",
      Retracted: true,
      Page: 1,
    });
    const report = run(h, "2023-06-12");
    expect(report).toMatchObject({ kind: "retraction-check", status: "succeeded" });
    expect(JSON.parse(report?.counts_json ?? "{}")).toMatchObject({
      OpenAlexRetractedSeen: 3,
      OpenAlexFlagged: 1,
      ArxivChecked: 0,
    });

    h.Clock.Now = "2023-06-12T11:00:00.000Z";
    await runScheduled(h.Deps, ADMISSION_CRON);
    const candidate = h.Database.Raw.prepare("SELECT hidden_reason FROM candidate").get() as {
      hidden_reason: string | null;
    };
    expect(candidate.hidden_reason).toBe("retracted");
  });

  it("REQ-DATA-008 AC1: a retracted work that is not stored changes nothing", async () => {
    const h = createHarness();
    await store(h, "2023-06-11T06:00:00.000Z", [
      mapOpenAlexWork(
        { ...fixture<OpenAlexWork>("openalex", "work-complete.json"), is_retracted: false },
        "2023-06-11T06:00:00.000Z",
      ),
    ]);
    h.SetOpenAlexPages([openAlexPage(retractedPage(), null)]);
    h.Clock.Now = "2023-06-12T08:00:00.000Z";
    await runScheduled(h.Deps, RETRACTION_CRON);
    await h.Drain();
    expect(retracted(h)).toEqual([0]);
  });

  it("REQ-DATA-008 AC1: a stored preprint arXiv now marks as withdrawn is flagged; older ones are not checked", async () => {
    const h = createHarness();
    await store(h, "2026-09-13T06:00:00.000Z", [
      mapArxivEntry(arxivEntry(1), "2026-09-13T06:00:00.000Z"),
      mapArxivEntry(arxivEntry(2), "2026-09-13T06:00:00.000Z"),
      mapArxivEntry(
        arxivEntry(3, { published: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z" }),
        "2026-09-13T06:00:00.000Z",
      ),
    ]);
    h.SetArxivEntries([
      arxivEntry(1, { withdrawn: true }),
      arxivEntry(2),
      arxivEntry(3, { withdrawn: true }),
    ]);
    h.SetOpenAlexPages([openAlexPage([], null)]);

    h.Clock.Now = "2026-09-14T08:00:00.000Z";
    await runScheduled(h.Deps, RETRACTION_CRON);
    await h.Drain();

    // The July preprint is older than the 30-day lookback, so it is not asked for.
    expect(h.ArxivIdRequests).toEqual([["2409.00001", "2409.00002"]]);
    expect(retracted(h)).toEqual([1, 0, 0]);
    expect(JSON.parse(run(h, "2026-09-14")?.counts_json ?? "{}")).toMatchObject({
      ArxivChecked: 2,
      ArxivFlagged: 1,
    });
  });

  it("REQ-DATA-008 AC1: the check pages through more than one page of each source", async () => {
    const h = createHarness();
    const count = ARXIV_IDS_PER_PAGE + 1;
    await store(
      h,
      "2026-09-13T06:00:00.000Z",
      Array.from({ length: count }, (_, i) =>
        mapArxivEntry(arxivEntry(i + 1), "2026-09-13T06:00:00.000Z"),
      ),
    );
    h.SetArxivEntries([arxivEntry(count, { withdrawn: true })]);
    h.Deps.Config = { ...h.Deps.Config, PageSize: 3 };
    h.SetOpenAlexPages([openAlexPage(retractedPage(), null), openAlexPage([], null)]);

    h.Clock.Now = "2026-09-14T08:00:00.000Z";
    await runScheduled(h.Deps, RETRACTION_CRON);
    await h.Drain();

    expect(h.ArxivIdRequests.map((ids) => ids.length)).toEqual([ARXIV_IDS_PER_PAGE, 1]);
    expect(h.OpenAlexRequests.map((request) => request.Page)).toEqual([1, 2]);
    expect(retracted(h).filter((flag) => flag === 1)).toHaveLength(1);
    expect(run(h, "2026-09-14")).toMatchObject({ status: "succeeded" });
  });

  it("REQ-DATA-008: a repeated trigger on the same day starts no second check", async () => {
    const h = createHarness();
    h.Clock.Now = "2026-09-14T08:00:00.000Z";
    expect(await startRetractionCheck(h.Deps, "2026-09-14")).toMatchObject({ Outcome: "started" });
    expect(await startRetractionCheck(h.Deps, "2026-09-14")).toMatchObject({
      Outcome: "already-ran",
    });
    expect(h.Queue.sent).toHaveLength(2);
  });
});
