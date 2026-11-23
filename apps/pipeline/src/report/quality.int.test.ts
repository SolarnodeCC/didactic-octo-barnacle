import { FakeWorkersAi } from "@roi/models";
import { FakeVectorize } from "@roi/vector-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AlertEvent } from "../alerts/types.js";
import { createHarness, type Harness } from "../test/harness.js";
import { reportProcessingRuns, storedProcessingReport } from "./processing-report.js";
import { qualitySection } from "./quality.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const DAY = "2026-11-20";
const RUN = "prun_quality";
const TEXT = "A secret abstract sentence that must never reach a report.";

type Setup = { h: Harness; alerts: AlertEvent[]; index: FakeVectorize };

function setup(): Setup {
  const index = new FakeVectorize();
  const h = createHarness(
    {},
    {
      Embedding: {
        Ai: new FakeWorkersAi([]),
        Send: false,
        Indexes: { PUBLICATION_VECTORS: index },
      },
    },
  );
  const alerts: AlertEvent[] = [];
  h.Deps.Alert = (event) => {
    alerts.push(event);
    return Promise.resolve();
  };
  return { h, alerts, index };
}

function sql(h: Harness, statement: string, ...values: unknown[]): void {
  h.Database.Raw.prepare(statement).run(...values);
}

function dailyRun(h: Harness, id: string, day: string, counts: Record<string, number> = {}): void {
  sql(
    h,
    `INSERT INTO processing_run (id, kind, day, status, started_at, counts_json)
     VALUES (?, 'daily', ?, 'running', ?, ?)`,
    id,
    day,
    `${day}T06:00:00.000Z`,
    JSON.stringify(counts),
  );
}

function publication(h: Harness, id: string, topics: string[] = ["cs.RO"]): void {
  sql(
    h,
    `INSERT INTO publication (id, title, abstract, completeness, topics_json, created_at, updated_at)
     VALUES (?, 'Title', ?, 'complete', ?, '2026-11-20T06:00:00.000Z', '2026-11-20T06:00:00.000Z')`,
    id,
    TEXT,
    JSON.stringify(topics),
  );
}

function triage(h: Harness, publicationId: string, accepted: boolean, trigger = 0): void {
  sql(
    h,
    `INSERT INTO triage_decision (id, publication_id, run_id, status, accepted, score, reason,
       signal_named_party, signal_stated_harm, signal_trigger, signal_existing_alternative,
       signal_adoptable, model, prompt_version, created_at, updated_at)
     VALUES (?, ?, ?, 'decided', ?, 0.6, ?, 1, 1, ?, 0, 1, '@cf/example/model', 'triage@2',
       '2026-11-20T07:00:00.000Z', '2026-11-20T07:00:00.000Z')`,
    `td_${publicationId}`,
    publicationId,
    RUN,
    accepted ? 1 : 0,
    accepted ? "accepted" : "low-score",
    trigger,
  );
}

function extraction(
  h: Harness,
  publicationId: string,
  candidates: Array<{ customer: string; whyNow?: boolean }>,
  options: { mode?: string; confidence?: number; positions?: number[] } = {},
): void {
  const resultId = `er_${publicationId}`;
  sql(
    h,
    `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
       confidence, candidate_count, quote_positions_json, created_at)
     VALUES (?, ?, ?, '@cf/example/model', 'extraction@4', ?, ?, ?, ?, '2026-11-20T08:00:00.000Z')`,
    resultId,
    publicationId,
    RUN,
    options.mode ?? "full-text",
    options.confidence ?? 0.75,
    candidates.length,
    JSON.stringify(options.positions ?? [1, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
  );
  candidates.forEach((candidate, i) => {
    sql(
      h,
      `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
         customer, customer_quote, why_now, why_now_quote, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-11-20T08:00:00.000Z')`,
      `c_${publicationId}_${i}`,
      publicationId,
      resultId,
      TEXT,
      TEXT,
      candidate.customer,
      `${candidate.customer} lose time`,
      candidate.whyNow ? "A new rule" : null,
      candidate.whyNow ? TEXT : null,
    );
  });
}

function vector(index: FakeVectorize, id: string, values: number[]): void {
  void index.upsert([{ id, values, metadata: { source: "arxiv", published_day: 20261120 } }]);
}

/**
 * A day with 20 model-triaged publications, 16 accepted; three extracted, two of them near
 * neighbours with the same customer, and one neighbour with another customer.
 */
function seedDay(s: Setup): void {
  const { h, index } = s;
  dailyRun(h, RUN, DAY, { CandidatesStored: 3, CandidatesDropped: 1, DroppedQuote: 1 });
  for (let i = 0; i < 20; i += 1) {
    const id = `pub_${String(i).padStart(2, "0")}`;
    publication(h, id, i === 2 ? ["Transportation"] : ["cs.RO"]);
    triage(h, id, i < 16, i === 0 ? 1 : 0);
  }
  extraction(h, "pub_00", [{ customer: "The hospital IT administrators", whyNow: true }]);
  extraction(h, "pub_01", [{ customer: "hospital IT administrators" }], {
    mode: "abstract",
    confidence: 0.7,
  });
  extraction(h, "pub_02", [{ customer: "bank risk teams" }], { confidence: 0.95 });
  extraction(h, "pub_03", []);
  vector(index, "pub_00", [1, 0, 0]);
  vector(index, "pub_01", [0.99, 0.1, 0]);
  vector(index, "pub_02", [0.98, 0.15, 0]);
  sql(
    h,
    `INSERT INTO model_call (id, run_kind, run_id, step_name, publication_id, model, attempt,
       cost_amount, cost_currency, outcome, created_at)
     VALUES ('mc_1', 'processing', ?, 'extraction', 'pub_00', 'm', 1, 0, 'EUR', 'invalid-output', ?),
            ('mc_2', 'processing', ?, 'extraction', 'pub_00', 'm', 2, 0, 'EUR', 'ok', ?),
            ('mc_3', 'processing', ?, 'extraction', 'pub_01', 'm', 1, 0, 'EUR', 'ok', ?)`,
    RUN,
    `${DAY}T08:00:00.000Z`,
    RUN,
    `${DAY}T08:00:01.000Z`,
    RUN,
    `${DAY}T08:00:02.000Z`,
  );
}

/** A processing start 30 days back and 14 days of baseline for one metric. */
function seedBaseline(h: Harness, metric: string, value: number): void {
  const started = h.Database.Raw.prepare(
    "SELECT 1 FROM processing_run WHERE id = 'prun_first'",
  ).get();
  if (!started) {
    dailyRun(h, "prun_first", "2026-10-21");
  }
  for (let i = 1; i <= 14; i += 1) {
    const date = new Date(`${DAY}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - i);
    sql(
      h,
      "INSERT INTO quality_metric (day, metric, value, items) VALUES (?, ?, ?, 25)",
      date.toISOString().slice(0, 10),
      metric,
      value,
    );
  }
}

const metric = (section: Awaited<ReturnType<typeof qualitySection>>, name: string) =>
  section?.Metrics.find((item) => item.Metric === name);

describe("REQ-NFR-023: the quality section of the daily report", () => {
  it("REQ-NFR-023: AC1 computes the rates and histograms from stored rows", async () => {
    const s = setup();
    seedDay(s);
    const section = await qualitySection(s.h.Deps, {
      RunId: RUN,
      Day: DAY,
      Counts: { CandidatesStored: 3, CandidatesDropped: 1, DroppedQuote: 1 },
    });

    expect(metric(section, "triage.accept_rate")).toMatchObject({ Value: 0.8, Items: 20 });
    expect(metric(section, "triage.signal.trigger")).toMatchObject({ Value: 0.05, Items: 20 });
    expect(metric(section, "triage.signal.named_party")).toMatchObject({ Value: 1 });
    expect(metric(section, "extraction.empty_share")).toMatchObject({ Value: 0.25, Items: 4 });
    expect(metric(section, "extraction.candidates_per_publication")).toMatchObject({
      Value: 0.75,
    });
    expect(metric(section, "extraction.abstract_only_share")).toMatchObject({ Value: 0.25 });
    expect(metric(section, "extraction.first_attempt_valid")).toMatchObject({
      Value: 0.5,
      Items: 2,
    });
    expect(metric(section, "extraction.repair_rate")).toMatchObject({ Value: 0.5 });
    expect(metric(section, "extraction.drop_rate")).toMatchObject({ Value: 0.25, Items: 4 });
    expect(metric(section, "extraction.quote_drop_rate")).toMatchObject({ Value: 0.25 });
    expect(metric(section, "extraction.customer_quote_no_overlap")).toMatchObject({ Value: 0 });
    expect(metric(section, "agreement.accepted_without_candidate")).toMatchObject({
      Value: 0.25,
      Items: 4,
    });
    expect(metric(section, "agreement.trigger_with_why_now")).toMatchObject({
      Value: 1,
      Items: 1,
    });
    expect(section?.ConfidenceHistogram).toEqual([0, 0, 0, 0, 0, 0, 0, 3, 0, 1]);
    expect(section?.QuotePositions).toEqual([4, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
    // Every publication maps to automotive; "Transportation" also maps to further industries.
    expect(section?.Industries).toMatchObject({ automotive: 4 });
    expect(section?.StartUp).toBe(true);
  });

  it("REQ-NFR-023: AC2 counts near-duplicates by vector neighbour and shared customer, with no embedding call", async () => {
    const s = setup();
    seedDay(s);
    const section = await qualitySection(s.h.Deps, { RunId: RUN, Day: DAY, Counts: {} });
    // pub_00 and pub_01 share the normalised customer; pub_02 is a neighbour with another one.
    expect(section?.NearDuplicates).toBe(1);
    expect(
      s.h.Database.Raw.prepare(
        "SELECT COUNT(*) AS n FROM model_call WHERE step_name = 'embedding'",
      ).get(),
    ).toEqual({ n: 0 });
  });

  it("REQ-NFR-023: AC3 a rate far from its 14-day median raises one quality-drift alert per metric and day", async () => {
    const s = setup();
    seedDay(s);
    seedBaseline(s.h, "triage.accept_rate", 0.2);
    seedBaseline(s.h, "extraction.empty_share", 0.01);
    const section = await qualitySection(s.h.Deps, { RunId: RUN, Day: DAY, Counts: {} });

    expect(metric(section, "triage.accept_rate")).toMatchObject({
      Value: 0.8,
      Baseline: 0.2,
      Drift: true,
    });
    // Far from its median too, but on 4 items, below monitor.min_daily_items.
    expect(metric(section, "extraction.empty_share")).toMatchObject({ Drift: false });
    const drifts = s.alerts.filter((alert) => alert.Type === "quality-drift");
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({ Source: "triage.accept_rate", RunId: RUN });
    expect(drifts[0]?.Summary).toContain("0.8 on 20 items, against a median of 0.2");
    expect(section?.StartUp).toBe(false);
  });

  it("REQ-NFR-023: AC3 a rate within the band does not alert, and the day's rates join the baseline", async () => {
    const s = setup();
    seedDay(s);
    seedBaseline(s.h, "triage.accept_rate", 0.7);
    const section = await qualitySection(s.h.Deps, { RunId: RUN, Day: DAY, Counts: {} });
    expect(metric(section, "triage.accept_rate")).toMatchObject({ Baseline: 0.7, Drift: false });
    expect(s.alerts).toEqual([]);
    expect(
      s.h.Database.Raw.prepare(
        "SELECT value, items FROM quality_metric WHERE day = ? AND metric = 'triage.accept_rate'",
      ).get(DAY),
    ).toEqual({ value: 0.8, items: 20 });
  });

  it("REQ-NFR-023: AC4 sends no alert during the first baseline days after processing starts", async () => {
    const s = setup();
    seedDay(s);
    seedBaseline(s.h, "triage.accept_rate", 0.2);
    // Processing started 10 days ago, inside monitor.baseline_days.
    s.h.Database.Raw.prepare(
      "UPDATE processing_run SET day = '2026-11-10' WHERE id = 'prun_first'",
    ).run();
    const section = await qualitySection(s.h.Deps, { RunId: RUN, Day: DAY, Counts: {} });
    expect(section?.StartUp).toBe(true);
    expect(metric(section, "triage.accept_rate")).toMatchObject({ Baseline: 0.2, Drift: false });
    expect(s.alerts).toEqual([]);
  });

  it("REQ-NFR-023: AC5 the stored daily report holds the section with counts and rates only", async () => {
    const s = setup();
    seedDay(s);
    s.h.Clock.Now = "2026-11-21T11:00:00.000Z";
    await reportProcessingRuns(s.h.Deps, "2026-11-21");
    const report = await storedProcessingReport(s.h.Database.Db, RUN);
    expect(report?.Quality?.Metrics.length).toBeGreaterThan(10);
    const stored = s.h.Database.Raw.prepare(
      "SELECT report_json FROM processing_run WHERE id = ?",
    ).get(RUN) as { report_json: string };
    expect(stored.report_json).not.toContain("secret abstract");
    expect(stored.report_json).not.toContain("hospital");
    expect(stored.report_json).not.toContain("bank risk");
  });
});
