import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMISSION_CRON } from "../config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, type Harness } from "../test/harness.js";
import {
  buildProcessingReport,
  reportProcessingRuns,
  storedProcessingReport,
} from "./processing-report.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const DAY = "2026-10-29";
const RUN = "prun_day";
const TEXT = "A secret abstract sentence that must never reach a report.";

let callNumber = 0;

function run(h: Harness, id: string, day: string, failures: unknown[] = []): void {
  h.Database.Raw.prepare(
    `INSERT INTO processing_run (id, kind, day, status, started_at, counts_json, failures_json)
     VALUES (?, 'daily', ?, 'running', ?, '{"Triaged":3,"Extracted":2}', ?)`,
  ).run(id, day, `${day}T06:00:00.000Z`, JSON.stringify(failures));
}

function publication(h: Harness, id: string): void {
  h.Database.Raw.prepare(
    `INSERT INTO publication (id, title, abstract, completeness, created_at, updated_at)
     VALUES (?, 'Title', ?, 'complete', '2026-10-29T06:00:00.000Z', '2026-10-29T06:00:00.000Z')`,
  ).run(id, TEXT);
}

function call(
  h: Harness,
  runId: string,
  step: string,
  publicationId: string | null,
  cost: number,
  estimated = 0,
): void {
  callNumber += 1;
  h.Database.Raw.prepare(
    `INSERT INTO model_call (id, run_kind, run_id, step_name, publication_id, model, attempt,
       cost_amount, cost_currency, estimated, outcome, created_at)
     VALUES (?, 'processing', ?, ?, ?, '@cf/example/model', 1, ?, 'EUR', ?, 'ok', ?)`,
  ).run(`mc_${callNumber}`, runId, step, publicationId, cost, estimated, `${DAY}T07:00:00.000Z`);
}

function extraction(h: Harness, runId: string, publicationId: string, candidates: number): void {
  const resultId = `er_${publicationId}`;
  h.Database.Raw.prepare(
    `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
       confidence, candidate_count, created_at)
     VALUES (?, ?, ?, '@cf/example/model', 'extraction@4', 'abstract', 0.7, ?, ?)`,
  ).run(resultId, publicationId, runId, candidates, `${DAY}T08:00:00.000Z`);
  for (let i = 0; i < candidates; i += 1) {
    h.Database.Raw.prepare(
      `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
         customer, customer_quote, created_at)
       VALUES (?, ?, ?, ?, ?, 'hospital IT administrators', ?, ?)`,
    ).run(
      `c_${publicationId}_${i}`,
      publicationId,
      resultId,
      TEXT,
      TEXT,
      TEXT,
      `${DAY}T08:00:00.000Z`,
    );
  }
}

/** A day with three publications triaged, two extracted, three candidates, and embeddings. */
function seedDay(h: Harness, failures: unknown[] = []): void {
  run(h, RUN, DAY, failures);
  for (const id of ["pub_a", "pub_b", "pub_c"]) {
    publication(h, id);
    call(h, RUN, "triage", id, 0.0001);
  }
  // pub_a's triage was retried: more cost, no more items.
  call(h, RUN, "triage", "pub_a", 0.0001);
  call(h, RUN, "extraction", "pub_a", 0.002, 1);
  call(h, RUN, "extraction", "pub_b", 0.002);
  call(h, RUN, "embedding", null, 0.0004);
  extraction(h, RUN, "pub_a", 2);
  extraction(h, RUN, "pub_b", 1);
  h.Database.Raw.prepare(
    "INSERT INTO budget_day (day, limit_amount, spent_amount, currency, stopped_at) VALUES (?, 1.25, 0.0048, 'EUR', NULL)",
  ).run(DAY);
}

describe("REQ-NFR-005: cost per publication and per opportunity in the run report", () => {
  it("REQ-NFR-005: AC3 reports the run's cost by step, per publication, and per opportunity", async () => {
    const h = createHarness();
    seedDay(h);
    const report = await buildProcessingReport(h.Database.Db, RUN);

    expect(report?.Cost).toEqual({
      Currency: "EUR",
      Total: 0.0048,
      ByStep: [
        { Step: "embedding", Calls: 1, Items: null, Cost: 0.0004 },
        { Step: "extraction", Calls: 2, Items: 2, Cost: 0.004 },
        { Step: "triage", Calls: 4, Items: 3, Cost: 0.0004 },
      ],
      EstimatedShare: 0.41666667,
      Publications: 3,
      CostPerPublication: 0.0016,
      Opportunities: 3,
      CostPerOpportunity: 0.0016,
    });
    expect(report?.Budget).toEqual({ Limit: 1.25, Spent: 0.0048, StoppedAt: null });
    expect(report?.Counts).toEqual({ Triaged: 3, Extracted: 2 });
  });

  it("REQ-NFR-005: AC3 a run without candidates has no cost per opportunity", async () => {
    const h = createHarness();
    run(h, RUN, DAY);
    publication(h, "pub_a");
    call(h, RUN, "triage", "pub_a", 0.0001);
    const report = await buildProcessingReport(h.Database.Db, RUN);
    expect(report?.Cost).toMatchObject({
      Total: 0.0001,
      CostPerPublication: 0.0001,
      Opportunities: 0,
      CostPerOpportunity: null,
    });
    expect(report?.Budget).toBeNull();
  });
});

describe("REQ-NFR-008: the daily processing run is closed and reported", () => {
  it("REQ-NFR-008: AC2 the admission cron closes yesterday's run and stores its report", async () => {
    const h = createHarness();
    seedDay(h);
    run(h, "prun_today", "2026-10-30");
    h.Clock.Now = "2026-10-30T11:00:00.000Z";
    await runScheduled(h.Deps, ADMISSION_CRON);

    const report = await storedProcessingReport(h.Database.Db, RUN);
    expect(report).toMatchObject({
      RunId: RUN,
      Status: "succeeded",
      EndedAt: "2026-10-30T11:00:00.000Z",
      Cost: { Total: 0.0048, CostPerOpportunity: 0.0016 },
    });
    // Today's run stays open.
    expect(await storedProcessingReport(h.Database.Db, "prun_today")).toBeNull();
    expect(
      h.Database.Raw.prepare("SELECT status FROM processing_run WHERE id = 'prun_today'").get(),
    ).toEqual({ status: "running" });
  });

  it("REQ-NFR-008: AC2 lists the failed-final items, ends partial, and keeps publication text out", async () => {
    const h = createHarness();
    seedDay(h, [{ PublicationId: "pub_c", Reason: "extraction failed-final after 3 re-drives" }]);
    h.Clock.Now = "2026-10-30T11:00:00.000Z";
    expect(await reportProcessingRuns(h.Deps, "2026-10-30")).toEqual([RUN]);

    const report = await storedProcessingReport(h.Database.Db, RUN);
    expect(report?.Status).toBe("partial");
    expect(report?.Failures).toEqual([
      { PublicationId: "pub_c", Reason: "extraction failed-final after 3 re-drives" },
    ]);
    const stored = h.Database.Raw.prepare(
      "SELECT report_json FROM processing_run WHERE id = ?",
    ).get(RUN) as { report_json: string };
    expect(stored.report_json).not.toContain("secret abstract");
    expect(stored.report_json).not.toContain("hospital");
  });

  it("REQ-NFR-008: AC2 closing again changes nothing", async () => {
    const h = createHarness();
    seedDay(h);
    h.Clock.Now = "2026-10-30T11:00:00.000Z";
    await reportProcessingRuns(h.Deps, "2026-10-30");
    const first = h.Database.Raw.prepare(
      "SELECT status, ended_at, report_json FROM processing_run WHERE id = ?",
    ).get(RUN);

    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    expect(await reportProcessingRuns(h.Deps, "2026-10-31")).toEqual([]);
    expect(
      h.Database.Raw.prepare(
        "SELECT status, ended_at, report_json FROM processing_run WHERE id = ?",
      ).get(RUN),
    ).toEqual(first);
  });
});
