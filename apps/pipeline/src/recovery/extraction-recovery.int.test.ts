import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AlertEvent } from "../alerts/types.js";
import { ADMISSION_CRON, RECOVERY_CRON } from "../config.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { extractEnvelope, type PipelineDeps } from "../queue/deps.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const DAY_1 = "2026-10-30";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ATTEMPTS = DEFAULT_PROCESSING_CONFIG.ModelMaxAttempts;
const ABSTRACT =
  "Hospital billing departments spend weeks reconciling insurance claims by hand. Today clerks use spreadsheets.";

const OK: FakeReply = {
  Kind: "output",
  Output: {
    Candidates: [
      {
        Finding: "Hospital billing departments lose weeks to manual claim reconciliation.",
        EvidenceQuote:
          "Hospital billing departments spend weeks reconciling insurance claims by hand.",
        Customer: "hospital billing departments",
        CustomerQuote: "Hospital billing departments",
        WhyNow: null,
        WhyNowQuote: null,
        CurrentAlternative: null,
        AlternativeQuote: null,
      },
    ],
    Confidence: 0.6,
    Notes: null,
  },
};
const PROBE_OK: FakeReply = {
  Kind: "output",
  Output: { Candidates: [], Confidence: 0.2, Notes: "A probe call." },
};
const PROVIDER_ERROR: FakeReply = { Kind: "error", Status: 503 };
const INVALID: FakeReply = { Kind: "output", Output: { Candidates: "none" } };

/** One failed step: every attempt fails the same way. */
const failing = (reply: FakeReply): FakeReply[] => Array.from({ length: ATTEMPTS }, () => reply);

type Setup = { h: Harness; ai: FakeWorkersAi; ids: string[]; alerts: AlertEvent[] };

/**
 * Stores `accepted` publications admitted on day 1 and `waiting` publications awaiting admission,
 * each with a known abstract; extraction runs on the scripted replies.
 */
async function setup(
  accepted: number,
  replies: FakeReply[],
  options: {
    Waiting?: number;
    DailyLimit?: number;
    Recovery?: Partial<NonNullable<PipelineDeps["Recovery"]>>;
  } = {},
): Promise<Setup> {
  const ai = new FakeWorkersAi(replies);
  const h = createHarness(
    {},
    {
      Triage: {
        Ai: new FakeWorkersAi([]),
        Send: false,
        ...(options.DailyLimit === undefined ? {} : { DailyLimit: options.DailyLimit }),
      },
      Extraction: { Ai: ai },
      Recovery: options.Recovery ?? {},
    },
  );
  const alerts: AlertEvent[] = [];
  h.Deps.Alert = (event) => {
    alerts.push(event);
    return Promise.resolve();
  };
  const waiting = options.Waiting ?? 0;
  h.SetOpenAlexPages([
    openAlexPage(
      Array.from({ length: accepted + waiting }, (_, i) => makeWork(i + 1)),
      null,
    ),
  ]);
  await runScheduled(h.Deps, OPENALEX_CRON);
  await h.Drain();
  const ids = (
    h.Database.Raw.prepare("SELECT id FROM publication ORDER BY id").all() as Array<{ id: string }>
  ).map((row) => row.id);
  ids.forEach((id, index) => {
    const admitted = index < accepted;
    h.Database.Raw.prepare("UPDATE publication SET abstract = ? WHERE id = ?").run(ABSTRACT, id);
    h.Database.Raw.prepare(
      `INSERT INTO triage_decision (id, publication_id, run_id, status, accepted, score, reason,
         signal_named_party, signal_stated_harm, signal_trigger, signal_existing_alternative,
         signal_adoptable, notes, model, prompt_version, admitted_on, created_at, updated_at)
       VALUES (?, ?, 'run_seed', ?, ?, 0.8, ?, 1, 1, 1, 1, 0, NULL,
         '@cf/google/gemma-4-26b-a4b-it', 'triage@2', ?, ?, ?)`,
    ).run(
      `tri_${id}`,
      id,
      admitted ? "decided" : "awaiting-admission",
      admitted ? 1 : 0,
      admitted ? "accepted" : null,
      admitted ? DAY_1 : null,
      `${DAY_1}T06:00:00.000Z`,
      `${DAY_1}T06:00:00.000Z`,
    );
  });
  return { h, ai, ids, alerts };
}

/** Day 1: the admitted publications are queued for extraction and extracted once. */
async function extractOnDay1(h: Harness, ids: string[]): Promise<void> {
  h.Clock.Now = `${DAY_1}T10:00:00.000Z`;
  for (const id of ids) {
    await h.Queue.send(extractEnvelope(id));
  }
  await h.Drain();
}

/** Runs the admission cron (re-drives, admission, extraction queueing) at 11:00 UTC on `day`. */
async function dailyCron(h: Harness, day: string): Promise<void> {
  h.Clock.Now = `${day}T11:00:00.000Z`;
  await runScheduled(h.Deps, ADMISSION_CRON);
  await h.Drain();
}

function redriveRow(h: Harness, publicationId: string) {
  return h.Database.Raw.prepare(
    "SELECT failure_class, count, final FROM redrive WHERE item_id = ? AND step = 'extraction'",
  ).get(publicationId) as { failure_class: string; count: number; final: number } | undefined;
}

function resultCount(h: Harness, publicationId: string): number {
  return (
    h.Database.Raw.prepare(
      "SELECT COUNT(*) AS n FROM extraction_result WHERE publication_id = ?",
    ).get(publicationId) as { n: number }
  ).n;
}

function run(h: Harness, day: string) {
  const row = h.Database.Raw.prepare(
    "SELECT counts_json, failures_json FROM processing_run WHERE kind = 'daily' AND day = ?",
  ).get(day) as { counts_json: string; failures_json: string } | undefined;
  return {
    Counts: JSON.parse(row?.counts_json ?? "{}") as Record<string, number>,
    Failures: JSON.parse(row?.failures_json ?? "[]") as Array<{
      PublicationId: string | null;
      Reason: string;
    }>,
  };
}

describe("REQ-PROC-010: automatic re-drive of failed extraction", () => {
  it("REQ-PROC-010: AC1 AC5 a transient failure is re-driven once a day, then failed-final and listed", async () => {
    const { h, ai, ids } = await setup(
      1,
      [...failing(PROVIDER_ERROR), ...failing(PROVIDER_ERROR), ...failing(PROVIDER_ERROR)],
      { Recovery: { MaxRedrives: 2 } },
    );
    const [id] = ids as [string];
    await extractOnDay1(h, ids);
    expect(redriveRow(h, id)).toEqual({ failure_class: "transient", count: 0, final: 0 });

    await dailyCron(h, "2026-10-31");
    expect(redriveRow(h, id)).toMatchObject({ count: 1, final: 0 });
    await dailyCron(h, "2026-11-01");
    expect(redriveRow(h, id)).toMatchObject({ count: 2, final: 0 });
    expect(ai.Calls).toHaveLength(3 * ATTEMPTS);

    await dailyCron(h, "2026-11-02");
    expect(redriveRow(h, id)).toMatchObject({ count: 2, final: 1 });
    expect(ai.Calls).toHaveLength(3 * ATTEMPTS);
    expect(run(h, "2026-11-02").Failures).toEqual([
      { PublicationId: id, Reason: "extraction failed-final after 2 re-drives (transient)" },
    ]);
    expect(run(h, "2026-11-02").Counts).toMatchObject({ ExtractionFailedFinal: 1 });

    // Failed-final stays out: a later cron sends nothing for it.
    h.Queue.sent.length = 0;
    await dailyCron(h, "2026-11-03");
    expect(h.Queue.sent).toEqual([]);
    expect(resultCount(h, id)).toBe(0);
  });

  it("REQ-PROC-010: AC2 a content failure is re-driven once the next day, then only after the model changes", async () => {
    const { h, ai, ids } = await setup(1, [...failing(INVALID), ...failing(INVALID), OK]);
    const [id] = ids as [string];
    await extractOnDay1(h, ids);
    expect(redriveRow(h, id)).toMatchObject({ failure_class: "content", count: 0 });

    await dailyCron(h, "2026-10-31");
    expect(ai.Calls).toHaveLength(2 * ATTEMPTS);
    await dailyCron(h, "2026-11-01");
    expect(ai.Calls).toHaveLength(2 * ATTEMPTS);
    expect(run(h, "2026-11-01").Counts).toMatchObject({ ExtractionWaitingForChange: 1 });

    const extraction = h.Deps.Extraction;
    if (!extraction) {
      throw new Error("extraction is not configured");
    }
    extraction.Model = { ...extraction.Model, Model: "@cf/google/gemma-4-26b-a4b-it" };
    await dailyCron(h, "2026-11-02");
    expect(resultCount(h, id)).toBe(1);
  });

  it("REQ-PROC-010: AC3 re-driven extractions count toward the daily extraction limit", async () => {
    const { h, ids } = await setup(1, [...failing(PROVIDER_ERROR), OK, OK, OK, OK], {
      Waiting: 4,
      DailyLimit: 3,
    });
    const [failed] = ids as [string];
    await extractOnDay1(h, [failed]);

    await dailyCron(h, "2026-10-31");
    const admitted = h.Database.Raw.prepare(
      "SELECT COUNT(*) AS n FROM triage_decision WHERE admitted_on = '2026-10-31'",
    ).get() as { n: number };
    // A limit of 3, less one re-driven extraction, admits 2 of the 4 waiting.
    expect(admitted.n).toBe(2);
    expect(run(h, "2026-10-31").Counts).toMatchObject({
      ExtractionRedriven: 1,
      RedrivenExtractionsCounted: 1,
      Admitted: 2,
    });
    expect(h.Count("extraction_result")).toBe(3);
  });

  it("REQ-PROC-010: AC4 AC7 an extraction refused by the budget completes the next day with one result", async () => {
    const { h, ai, ids } = await setup(1, [OK]);
    const [id] = ids as [string];
    h.Database.Raw.prepare(
      "INSERT INTO budget_day (day, limit_amount, spent_amount, currency) VALUES (?, 1, 1, 'EUR')",
    ).run(DAY_1);
    await extractOnDay1(h, ids);
    expect(ai.Calls).toHaveLength(0);
    expect(redriveRow(h, id)).toMatchObject({ failure_class: "transient", count: 0 });

    await dailyCron(h, "2026-10-31");
    expect(resultCount(h, id)).toBe(1);
    // A later cron re-drives nothing: the publication has its result.
    await dailyCron(h, "2026-11-01");
    expect(resultCount(h, id)).toBe(1);
    expect(ai.Calls).toHaveLength(1);
  });

  it("REQ-PROC-010: AC3 at most recovery.max_redrives_per_day items are re-driven a day", async () => {
    const { h, ids } = await setup(
      2,
      [...failing(PROVIDER_ERROR), ...failing(PROVIDER_ERROR), OK, OK],
      { Recovery: { MaxRedrivesPerDay: 1 } },
    );
    await extractOnDay1(h, ids);
    await dailyCron(h, "2026-10-31");
    expect(run(h, "2026-10-31").Counts).toMatchObject({
      ExtractionRedriven: 1,
      ExtractionOverDailyCap: 1,
    });
    await dailyCron(h, "2026-11-01");
    expect(h.Count("extraction_result")).toBe(2);
  });
});

describe("REQ-PROC-010: the extraction circuit breaker", () => {
  it("REQ-PROC-010: AC6 pauses on provider errors, alerts once, defers without calls, and resumes after a probe", async () => {
    const { h, ai, ids, alerts } = await setup(2, [...failing(PROVIDER_ERROR), PROBE_OK], {
      Recovery: { BreakerMinCalls: ATTEMPTS },
    });
    const [first, second] = ids as [string, string];
    await extractOnDay1(h, [first]);
    expect(alerts.map((a) => [a.Type, a.Source])).toEqual([["step-paused", "extraction"]]);

    await extractOnDay1(h, [second]);
    expect(ai.Calls).toHaveLength(ATTEMPTS);
    expect(redriveRow(h, second)).toMatchObject({ failure_class: "transient" });

    h.Clock.Now = `${DAY_1}T10:31:00.000Z`;
    await runScheduled(h.Deps, RECOVERY_CRON);
    expect(ai.Calls).toHaveLength(ATTEMPTS + 1);
    const pause = h.Database.Raw.prepare(
      "SELECT resumed_at FROM step_pause WHERE step = 'extraction'",
    ).get() as { resumed_at: string | null };
    expect(pause.resumed_at).toBe(`${DAY_1}T10:31:00.000Z`);
    expect(alerts).toHaveLength(1);
  });
});
