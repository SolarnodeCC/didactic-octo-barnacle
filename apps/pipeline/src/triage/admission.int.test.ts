import { FakeWorkersAi } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { admitDay } from "./admission.js";
import { ADMISSION_CRON } from "../config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
/** The harness clock starts at 06:00 on this day; triage decisions are made then. */
const DAY = "2026-10-30";
const TRIAGED_AT = `${DAY}T06:00:00.000Z`;
const ADMISSION_AT = `${DAY}T11:00:00.000Z`;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

type Seed = { Score?: number; PublishedAt?: string; CreatedAt?: string };

/** Stores `count` publications and gives each a passing triage decision awaiting admission. */
async function setup(
  count: number,
  options: { DailyLimit?: number; BudgetEur?: number; Seeds?: Seed[] } = {},
): Promise<{ h: Harness; ids: string[] }> {
  const h = createHarness(
    {},
    {
      Triage: {
        Ai: new FakeWorkersAi([]),
        Send: false,
        ...(options.DailyLimit === undefined ? {} : { DailyLimit: options.DailyLimit }),
        ...(options.BudgetEur === undefined ? {} : { BudgetEur: options.BudgetEur }),
      },
    },
  );
  h.SetOpenAlexPages([
    openAlexPage(
      Array.from({ length: count }, (_, i) => makeWork(i + 1)),
      null,
    ),
  ]);
  await runScheduled(h.Deps, OPENALEX_CRON);
  await h.Drain();
  const ids = (
    h.Database.Raw.prepare("SELECT id FROM publication ORDER BY id").all() as Array<{ id: string }>
  ).map((row) => row.id);
  ids.forEach((id, index) => seedDecision(h, id, options.Seeds?.[index] ?? {}));
  h.Clock.Now = ADMISSION_AT;
  return { h, ids };
}

function seedDecision(h: Harness, publicationId: string, seed: Seed): void {
  const raw = h.Database.Raw;
  if (seed.PublishedAt) {
    raw
      .prepare("UPDATE publication SET published_at = ? WHERE id = ?")
      .run(seed.PublishedAt, publicationId);
  }
  const created = seed.CreatedAt ?? TRIAGED_AT;
  raw
    .prepare(
      `INSERT INTO triage_decision (id, publication_id, run_id, status, accepted, score, reason,
         signal_named_party, signal_stated_harm, signal_trigger, signal_existing_alternative,
         signal_adoptable, notes, model, prompt_version, admitted_on, created_at, updated_at)
       VALUES (?, ?, 'run_seed', 'awaiting-admission', 0, ?, NULL, 1, 1, 1, 0, 0, NULL,
         '@cf/google/gemma-4-26b-a4b-it', 'triage@2', NULL, ?, ?)`,
    )
    .run(`tri_${publicationId}`, publicationId, seed.Score ?? 0.6, created, created);
}

type Row = {
  publication_id: string;
  status: string;
  accepted: number;
  reason: string | null;
  admitted_on: string | null;
};

function decisions(h: Harness): Map<string, Row> {
  const rows = h.Database.Raw.prepare(
    "SELECT publication_id, status, accepted, reason, admitted_on FROM triage_decision",
  ).all() as Row[];
  return new Map(rows.map((row) => [row.publication_id, row]));
}

function admittedIds(h: Harness): string[] {
  return [...decisions(h).values()]
    .filter((row) => row.accepted === 1)
    .map((row) => row.publication_id)
    .sort();
}

function runCounts(h: Harness): Record<string, number> {
  const row = h.Database.Raw.prepare(
    "SELECT counts_json FROM processing_run WHERE kind = 'daily' AND day = ?",
  ).get(DAY) as { counts_json: string } | undefined;
  return JSON.parse(row?.counts_json ?? "{}") as Record<string, number>;
}

/** Gives the publication a PDF URL with a license that allows storage (REQ-DATA-010). */
function withStorablePdf(h: Harness, publicationId: string): void {
  h.Database.Raw.prepare(
    "UPDATE source_record SET pdf_url = 'https://repo.example.org/p.pdf', pdf_license = 'cc-by' WHERE publication_id = ?",
  ).run(publicationId);
}

function withDocument(h: Harness, publicationId: string, status: string): void {
  h.Database.Raw.prepare(
    "INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, status, stored_at) VALUES (?, ?, ?, ?, 'cc-by', ?, ?)",
  ).run(
    `doc_${publicationId}`,
    publicationId,
    `pdfs/${publicationId}.pdf`,
    `hash_${publicationId}`,
    status,
    TRIAGED_AT,
  );
}

function withPdfMessage(h: Harness, publicationId: string, status: string): void {
  h.Database.Raw.prepare(
    "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, updated_at, created_at) VALUES (?, ?, 'document.ingest', '1', ?, 1, 0, ?, ?)",
  ).run(
    `qml_document:${publicationId}`,
    `document:${publicationId}`,
    status,
    TRIAGED_AT,
    TRIAGED_AT,
  );
}

describe("REQ-PROC-005: daily admission to extraction", () => {
  it("REQ-PROC-005: AC2 admits at most the daily limit; the rest get daily-limit and are considered again the next day", async () => {
    const { h, ids } = await setup(5, { DailyLimit: 2 });
    const result = await admitDay(h.Deps, DAY);

    expect(result).toMatchObject({
      Outcome: "admitted",
      Counts: { Admitted: 2, DeferredDailyLimit: 3 },
    });
    const rows = decisions(h);
    const admitted = ids.filter((id) => rows.get(id)?.accepted === 1);
    expect(admitted).toHaveLength(2);
    for (const id of admitted) {
      expect(rows.get(id)).toMatchObject({
        status: "decided",
        reason: "accepted",
        admitted_on: DAY,
      });
    }
    for (const id of ids.filter((id) => !admitted.includes(id))) {
      expect(rows.get(id)).toMatchObject({
        status: "awaiting-admission",
        reason: "daily-limit",
        accepted: 0,
      });
    }
    expect(
      h.Database.Raw.prepare(
        "SELECT day, daily_limit, admitted, deferred FROM admission_day",
      ).all(),
    ).toEqual([{ day: DAY, daily_limit: 2, admitted: 2, deferred: 3 }]);

    // The next day the deferred publications are ranked again.
    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    await admitDay(h.Deps, "2026-10-31");
    expect(admittedIds(h)).toHaveLength(4);
  });

  it("REQ-PROC-005: a repeated admission trigger admits nobody twice", async () => {
    const { h } = await setup(3, { DailyLimit: 2 });
    await runScheduled(h.Deps, ADMISSION_CRON);
    const after = decisions(h);
    expect(await admitDay(h.Deps, DAY)).toEqual({ Outcome: "already-ran", Day: DAY });
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(decisions(h)).toEqual(after);
    expect(admittedIds(h)).toHaveLength(2);
  });

  it("REQ-NFR-005: AC2 with the day's budget used up, admission admits nobody", async () => {
    const { h } = await setup(2, { BudgetEur: 0 });
    expect(await admitDay(h.Deps, DAY)).toEqual({ Outcome: "budget-stopped", Day: DAY });
    expect(admittedIds(h)).toEqual([]);
    expect(h.Database.Raw.prepare("SELECT COUNT(*) AS n FROM admission_day").get()).toEqual({
      n: 0,
    });
  });

  it("REQ-PROC-005: a decision older than the pool leaves it with daily-limit as its final reason", async () => {
    const { h, ids } = await setup(2, {
      DailyLimit: 5,
      Seeds: [{ CreatedAt: "2026-10-20T06:00:00.000Z" }, {}],
    });
    const result = await admitDay(h.Deps, DAY);

    expect(result).toMatchObject({ Counts: { Admitted: 1, ExpiredFromPool: 1 } });
    expect(decisions(h).get(ids[0] ?? "")).toMatchObject({
      status: "decided",
      reason: "daily-limit",
      accepted: 0,
    });
  });

  it("REQ-PROC-005: a publication dated after the run day is left out of the ranking", async () => {
    const { h, ids } = await setup(2, { Seeds: [{ PublishedAt: "2027-01-01" }, {}] });
    const result = await admitDay(h.Deps, DAY);

    expect(result).toMatchObject({ Counts: { Admitted: 1, FutureDated: 1 } });
    expect(decisions(h).get(ids[0] ?? "")).toMatchObject({
      status: "awaiting-admission",
      reason: null,
    });
  });
});

describe("REQ-PROC-008: ranking for the daily limit", () => {
  it("REQ-PROC-008: AC4 ranks by score, then newest publication date, then publication ID, the same way every run", async () => {
    const seeds: Seed[] = [
      { Score: 0.6, PublishedAt: "2026-10-01" },
      { Score: 0.8, PublishedAt: "2026-09-01" },
      { Score: 0.6, PublishedAt: "2026-10-20" },
      { Score: 0.6, PublishedAt: "2026-10-20" },
      { Score: 1, PublishedAt: "2026-08-01" },
    ];
    const first = await setup(5, { DailyLimit: 4, Seeds: seeds });
    await admitDay(first.h.Deps, DAY);
    const [a, b, c, d, e] = first.ids;
    // Score 1 and 0.8 first; then the two newest 0.6 by ID; the oldest 0.6 waits.
    expect(admittedIds(first.h)).toEqual([b, c, d, e].sort());
    expect(decisions(first.h).get(a ?? "")?.reason).toBe("daily-limit");

    const tie = await setup(5, { DailyLimit: 3, Seeds: seeds });
    await admitDay(tie.h.Deps, DAY);
    // Of the two equal 0.6 entries with the same date, the lower ID wins.
    const lower = [tie.ids[2] ?? "", tie.ids[3] ?? ""].sort()[0];
    expect(admittedIds(tie.h)).toEqual([tie.ids[1], tie.ids[4], lower].sort());

    const again = await setup(5, { DailyLimit: 3, Seeds: seeds });
    await admitDay(again.h.Deps, DAY);
    expect(admittedIds(again.h)).toEqual(admittedIds(tie.h));
  });
});

describe("REQ-PROC-011: admission waits for full text", () => {
  it("REQ-PROC-011: AC1 AC2 admits publications whose document state is final and holds the rest without using the limit", async () => {
    const { h, ids } = await setup(6, { DailyLimit: 10 });
    const [extracted, failed, pending, noDocument, inFlight, noPdf] = ids as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    for (const id of [extracted, failed, pending, noDocument, inFlight]) {
      withStorablePdf(h, id);
    }
    withDocument(h, extracted, "text-extracted");
    withDocument(h, failed, "text-failed");
    withDocument(h, pending, "stored");
    withPdfMessage(h, noDocument, "completed");
    withPdfMessage(h, inFlight, "processing");

    const result = await admitDay(h.Deps, DAY);

    expect(admittedIds(h)).toEqual([extracted, failed, noDocument, noPdf].sort());
    expect(result).toMatchObject({ Counts: { Admitted: 4, NotReady: 2, DeferredDailyLimit: 0 } });
    for (const id of [pending, inFlight]) {
      expect(decisions(h).get(id)).toMatchObject({ status: "awaiting-admission", reason: null });
    }
  });

  it("REQ-PROC-011: AC3 AC5 after the wait a publication is admitted on its abstract, and the run report counts it", async () => {
    const { h, ids } = await setup(2, { DailyLimit: 10 });
    const [pending, ready] = ids as [string, string];
    withStorablePdf(h, pending);
    withDocument(h, pending, "stored");

    await admitDay(h.Deps, DAY);
    expect(admittedIds(h)).toEqual([ready]);

    // The next day's run is 29 hours after the triage decision: past the 24-hour wait.
    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    const result = await admitDay(h.Deps, "2026-10-31");
    expect(admittedIds(h)).toEqual([pending, ready].sort());
    expect(result).toMatchObject({ Counts: { Admitted: 1, AdmittedOnAbstractAfterWait: 1 } });
    expect(runCounts(h)).toMatchObject({
      Admitted: 1,
      NotReady: 1,
      AdmittedOnAbstractAfterWait: 0,
    });
  });

  it("REQ-PROC-011: AC4 the same input gives the same admitted set, whatever is not ready", async () => {
    const seeds: Seed[] = [{ Score: 1 }, { Score: 0.8 }, { Score: 0.6 }];
    const runs = await Promise.all(
      [0, 1].map(async () => {
        const { h, ids } = await setup(3, { DailyLimit: 1, Seeds: seeds });
        // The best-ranked publication still waits for its text, so the second one is admitted.
        withStorablePdf(h, ids[0] ?? "");
        withDocument(h, ids[0] ?? "", "stored");
        await admitDay(h.Deps, DAY);
        return { admitted: admittedIds(h), expected: [ids[1]] };
      }),
    );
    for (const run of runs) {
      expect(run.admitted).toEqual(run.expected);
    }
  });
});
