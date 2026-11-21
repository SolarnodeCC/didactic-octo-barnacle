import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeTriage } from "./breaker.js";
import { replayDueDeadLetters } from "./dead-letters.js";
import { redriveTriage } from "./redrive.js";
import { type AlertEvent } from "../alerts/types.js";
import { ADMISSION_CRON, RECOVERY_CRON } from "../config.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { type PipelineDeps } from "../queue/deps.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";

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

const OK: FakeReply = {
  Kind: "output",
  Output: {
    Signals: {
      NamedParty: true,
      StatedHarm: true,
      Trigger: false,
      ExistingAlternative: false,
      Adoptable: true,
    },
    Notes: null,
  },
};
const PROVIDER_ERROR: FakeReply = { Kind: "error", Status: 503 };
const INVALID: FakeReply = { Kind: "output", Output: { Verdict: "yes" } };

/** One failed step: every attempt fails the same way. */
const failing = (reply: FakeReply): FakeReply[] => Array.from({ length: ATTEMPTS }, () => reply);

type Setup = {
  h: Harness;
  ai: FakeWorkersAi;
  ids: string[];
  alerts: AlertEvent[];
};

/** Ingests `count` works with triage on, so each is triaged with the scripted replies. */
async function setup(
  count: number,
  replies: FakeReply[],
  recovery: Partial<NonNullable<PipelineDeps["Recovery"]>> = {},
): Promise<Setup> {
  const ai = new FakeWorkersAi(replies);
  const h = createHarness({}, { Triage: { Ai: ai }, Recovery: recovery });
  const alerts: AlertEvent[] = [];
  h.Deps.Alert = (event) => {
    alerts.push(event);
    return Promise.resolve();
  };
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
  return { h, ai, ids, alerts };
}

/** Runs the admission cron (re-drive, then admission) at 11:00 UTC on `day`, and the queue. */
async function dailyCron(h: Harness, day: string): Promise<void> {
  h.Clock.Now = `${day}T11:00:00.000Z`;
  await runScheduled(h.Deps, ADMISSION_CRON);
  await h.Drain();
}

function decisionCount(h: Harness, publicationId?: string): number {
  const row = (
    publicationId
      ? h.Database.Raw.prepare(
          "SELECT COUNT(*) AS n FROM triage_decision WHERE publication_id = ?",
        ).get(publicationId)
      : h.Database.Raw.prepare("SELECT COUNT(*) AS n FROM triage_decision").get()
  ) as { n: number };
  return row.n;
}

function redriveRow(h: Harness, publicationId: string) {
  return h.Database.Raw.prepare(
    "SELECT failure_class, count, final FROM redrive WHERE item_id = ? AND step = 'triage'",
  ).get(publicationId) as { failure_class: string; count: number; final: number } | undefined;
}

function runFailures(
  h: Harness,
  day: string,
): Array<{ PublicationId: string | null; Reason: string }> {
  const row = h.Database.Raw.prepare(
    "SELECT failures_json FROM processing_run WHERE kind = 'daily' AND day = ?",
  ).get(day) as { failures_json: string } | undefined;
  return JSON.parse(row?.failures_json ?? "[]") as Array<{
    PublicationId: string | null;
    Reason: string;
  }>;
}

describe("REQ-PROC-010: automatic re-drive of failed triage", () => {
  it("REQ-PROC-010: AC1 a transient failure is recorded and re-driven by the next day's cron", async () => {
    const { h, ai, ids } = await setup(1, [...failing(PROVIDER_ERROR), OK]);
    const [id = ""] = ids;
    expect(decisionCount(h)).toBe(0);
    expect(redriveRow(h, id)).toEqual({ failure_class: "transient", count: 0, final: 0 });

    await dailyCron(h, "2026-10-31");
    expect(decisionCount(h, id)).toBe(1);
    expect(redriveRow(h, id)?.count).toBe(1);
    expect(ai.Remaining).toBe(0);
  });

  it("REQ-PROC-010: AC1 AC5 a transient failure is re-driven at most once a day, then failed-final and listed in the run report", async () => {
    const { h, ai, ids } = await setup(1, [
      ...failing(PROVIDER_ERROR),
      ...failing(PROVIDER_ERROR),
      ...failing(PROVIDER_ERROR),
      ...failing(PROVIDER_ERROR),
    ]);
    const [id = ""] = ids;

    await dailyCron(h, "2026-10-31");
    // A second trigger the same day re-drives nothing.
    await dailyCron(h, "2026-10-31");
    expect(redriveRow(h, id)?.count).toBe(1);

    await dailyCron(h, "2026-11-01");
    await dailyCron(h, "2026-11-02");
    expect(redriveRow(h, id)).toMatchObject({ count: 3, final: 0 });
    expect(ai.Remaining).toBe(0);

    await dailyCron(h, "2026-11-03");
    expect(redriveRow(h, id)).toMatchObject({ count: 3, final: 1 });
    expect(runFailures(h, "2026-11-03")).toEqual([
      { PublicationId: id, Reason: "triage failed-final after 3 re-drives (transient)" },
    ]);
    // Failed-final stays out of later re-drives.
    await dailyCron(h, "2026-11-04");
    expect(redriveRow(h, id)?.count).toBe(3);
    expect(decisionCount(h)).toBe(0);
  });

  it("REQ-PROC-010: AC2 a content failure is re-driven once the next day, then only after the model changes", async () => {
    const { h, ai, ids } = await setup(1, [...failing(INVALID), ...failing(INVALID), OK]);
    const [id = ""] = ids;
    expect(redriveRow(h, id)?.failure_class).toBe("content");

    // Not the same day it failed.
    await dailyCron(h, "2026-10-30");
    expect(redriveRow(h, id)?.count).toBe(0);

    await dailyCron(h, "2026-10-31");
    expect(redriveRow(h, id)?.count).toBe(1);
    // It failed again on the same model and prompt: it waits for a change.
    await dailyCron(h, "2026-11-01");
    expect(redriveRow(h, id)?.count).toBe(1);

    const triage = h.Deps.Triage;
    if (!triage) {
      throw new Error("triage is not configured");
    }
    h.Deps.Triage = { ...triage, Model: { ...triage.Model, Model: "@cf/zai-org/glm-4.7-flash" } };
    await dailyCron(h, "2026-11-02");
    expect(redriveRow(h, id)?.count).toBe(2);
    expect(decisionCount(h, id)).toBe(1);
    expect(ai.Remaining).toBe(0);
  });

  it("REQ-PROC-010: AC3 at most recovery.max_redrives_per_day items are re-driven a day", async () => {
    const { h, ids } = await setup(
      3,
      [
        ...failing(PROVIDER_ERROR),
        ...failing(PROVIDER_ERROR),
        ...failing(PROVIDER_ERROR),
        OK,
        OK,
        OK,
      ],
      { MaxRedrivesPerDay: 2 },
    );
    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    const result = await redriveTriage(h.Deps, "2026-10-31");
    expect(result).toMatchObject({ Counts: { Redriven: 2, OverDailyCap: 1 } });
    await h.Drain();
    expect(decisionCount(h)).toBe(2);

    await dailyCron(h, "2026-11-01");
    expect(ids.map((id) => decisionCount(h, id))).toEqual([1, 1, 1]);
  });

  it("REQ-PROC-010: AC1 a triage refused by the budget is re-driven the next day", async () => {
    const ai = new FakeWorkersAi([OK]);
    const h = createHarness({}, { Triage: { Ai: ai, BudgetEur: 0 } });
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    const [{ id }] = h.Database.Raw.prepare("SELECT id FROM publication").all() as [{ id: string }];
    expect(redriveRow(h, id)).toMatchObject({ failure_class: "transient", count: 0 });

    // The next day has a budget again.
    h.Database.Raw.prepare(
      "INSERT INTO budget_day (day, limit_amount, spent_amount, currency) VALUES ('2026-10-31', 1, 0, 'EUR')",
    ).run();
    await dailyCron(h, "2026-10-31");
    expect(decisionCount(h, id)).toBe(1);
  });

  it("REQ-PROC-010: AC7 a publication that has a decision is never re-driven", async () => {
    const { h, ai, ids } = await setup(1, [OK]);
    const [id = ""] = ids;
    h.Database.Raw.prepare(
      "INSERT INTO redrive (id, item_kind, item_id, step, failure_class, last_failed_at, created_at, updated_at) VALUES ('rd_x', 'publication', ?, 'triage', 'transient', '2026-10-30T06:00:00.000Z', '2026-10-30T06:00:00.000Z', '2026-10-30T06:00:00.000Z')",
    ).run(id);
    const sent = h.Queue.sent.length;

    await dailyCron(h, "2026-10-31");
    expect(h.Queue.sent.length).toBe(sent);
    expect(decisionCount(h, id)).toBe(1);
    expect(ai.Calls).toHaveLength(1);
  });
});

describe("REQ-PROC-010: circuit breaker", () => {
  it("REQ-PROC-010: AC6 pauses on provider errors, alerts once, defers without calls, and resumes after a successful probe", async () => {
    const { h, ai, ids, alerts } = await setup(
      2, // The probe uses one OK; the two re-driven triages use the others.
      [...failing(PROVIDER_ERROR), OK, OK, OK],
      {
        BreakerMinCalls: 3,
      },
    );
    const [first = "", second = ""] = ids;
    // The first triage's three provider errors pause the step; the second makes no call.
    expect(alerts.filter((alert) => alert.Type === "step-paused")).toHaveLength(1);
    expect(ai.Calls).toHaveLength(ATTEMPTS);
    expect(redriveRow(h, second)).toMatchObject({ failure_class: "transient", count: 0 });

    // While paused, the daily cron re-drives nothing, so waiting uses up no re-drives.
    await dailyCron(h, "2026-10-30");
    expect(redriveRow(h, first)?.count).toBe(0);

    // The probe is due 30 minutes after the pause and resumes the step.
    h.Clock.Now = "2026-10-30T11:31:00.000Z";
    expect(await probeTriage(h.Deps)).toBe("resumed");
    expect(await probeTriage(h.Deps)).toBe("not-paused");

    await dailyCron(h, "2026-10-31");
    expect(decisionCount(h)).toBe(2);
    expect(alerts.filter((alert) => alert.Type === "step-paused")).toHaveLength(1);
  });

  it("REQ-PROC-010: AC6 a probe runs at most every 30 minutes and keeps the pause while it fails", async () => {
    const { h, ai } = await setup(1, [...failing(PROVIDER_ERROR), ...failing(PROVIDER_ERROR)], {
      BreakerMinCalls: 3,
    });
    h.Clock.Now = "2026-10-30T06:10:00.000Z";
    expect(await probeTriage(h.Deps)).toBe("not-due");
    h.Clock.Now = "2026-10-30T06:31:00.000Z";
    await runScheduled(h.Deps, RECOVERY_CRON);
    expect(ai.Remaining).toBe(0);
    h.Clock.Now = "2026-10-30T06:45:00.000Z";
    expect(await probeTriage(h.Deps)).toBe("not-due");
  });
});

describe("REQ-DATA-012: automatic dead-letter replay", () => {
  it("REQ-DATA-012: AC1 AC2 a dead-lettered page is replayed after the delay, at most twice, and finishes its run", async () => {
    const h = createHarness();
    const alerts: AlertEvent[] = [];
    h.Deps.Alert = (event) => {
      alerts.push(event);
      return Promise.resolve();
    };
    const outage = new Error("OpenAlex is down");
    h.SetOpenAlexPages([outage, outage, outage, outage]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ MaxRetries: 3 });
    expect(h.Run()).toMatchObject({ status: "failed" });
    const messageId = (
      h.Database.Raw.prepare(
        "SELECT message_id FROM queue_message_log WHERE status = 'dead-lettered'",
      ).get() as { message_id: string }
    ).message_id;

    // Not before the delay.
    h.Clock.Now = "2026-10-30T11:00:00.000Z";
    expect(await replayDueDeadLetters(h.Deps)).toMatchObject({ Replayed: 0 });

    // Six hours later it is replayed; the source fails again and it is dead-lettered again.
    h.Clock.Now = "2026-10-30T12:01:00.000Z";
    h.SetOpenAlexPages([outage, outage, outage, outage]);
    expect(await replayDueDeadLetters(h.Deps)).toMatchObject({ Replayed: 1 });
    await h.Drain({ MaxRetries: 3 });

    // The second replay: the source is back, and the run finishes with its works.
    h.Clock.Now = "2026-10-30T18:02:00.000Z";
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, RECOVERY_CRON);
    await h.Drain({ MaxRetries: 3 });

    expect(h.Run()).toMatchObject({ status: "succeeded" });
    expect(h.Count("publication")).toBe(1);
    const row = h.Database.Raw.prepare(
      "SELECT status, replay_count FROM queue_message_log WHERE message_id = ?",
    ).get(messageId);
    expect(row).toEqual({ status: "completed", replay_count: 2 });
    // The dead-letter alert stays, once for each dead letter.
    expect(alerts.filter((alert) => alert.Type === "dead-letter")).toHaveLength(2);
  });

  it("REQ-DATA-012: AC3 after the second replay fails the message stays dead-lettered and is listed in the run report", async () => {
    const h = createHarness();
    const outage = new Error("OpenAlex is down");
    const fail = () => h.SetOpenAlexPages([outage, outage, outage, outage]);
    fail();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ MaxRetries: 3 });

    for (const time of ["2026-10-30T12:01:00.000Z", "2026-10-30T18:02:00.000Z"]) {
      h.Clock.Now = time;
      fail();
      await replayDueDeadLetters(h.Deps);
      await h.Drain({ MaxRetries: 3 });
    }
    h.Clock.Now = "2026-10-31T01:00:00.000Z";
    expect(await replayDueDeadLetters(h.Deps)).toEqual({
      Replayed: 0,
      ReplayFailed: 0,
      Exhausted: 1,
    });
    const row = h.Database.Raw.prepare(
      "SELECT status, replay_count FROM queue_message_log WHERE status = 'dead-lettered'",
    ).get();
    expect(row).toEqual({ status: "dead-lettered", replay_count: 2 });
    expect(runFailures(h, "2026-10-31")).toEqual([
      expect.objectContaining({
        PublicationId: null,
        Reason: expect.stringMatching(/still dead-lettered after 2 automatic replays/) as string,
      }),
    ]);
  });
});
