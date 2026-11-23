import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AlertEvent } from "../alerts/types.js";
import { ADMISSION_CRON } from "../config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createModelUsageStore } from "../store/model-usage.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";
import { createTestDatabase } from "../test/sqlite-d1.js";

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
const INVALID: FakeReply = { Kind: "output", Output: { Verdict: "yes" } };

/**
 * One triage attempt with the fake's usage (100 input and 20 output tokens on Gemma at
 * USD 0.10 / 0.30 per million) costs USD 0.000016, about EUR 0.0000143.
 */
const BUDGET_FOR_THREE_CALLS = 0.00003;

type Setup = { h: Harness; ai: FakeWorkersAi; alerts: AlertEvent[]; ids: string[] };

/** Ingests `count` works on 2026-10-30 with a small budget, so triage runs into the stop. */
async function setup(count: number, replies: FakeReply[], budget: number): Promise<Setup> {
  const ai = new FakeWorkersAi(replies);
  const h = createHarness({}, { Triage: { Ai: ai, BudgetEur: budget } });
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
  return { h, ai, alerts, ids };
}

async function dailyCron(h: Harness, day: string): Promise<void> {
  h.Clock.Now = `${day}T11:00:00.000Z`;
  await runScheduled(h.Deps, ADMISSION_CRON);
  await h.Drain();
}

function budgetDay(h: Harness, day: string) {
  return h.Database.Raw.prepare(
    "SELECT limit_amount, spent_amount, stopped_at, alerted_at FROM budget_day WHERE day = ?",
  ).get(day) as
    | {
        limit_amount: number;
        spent_amount: number;
        stopped_at: string | null;
        alerted_at: string | null;
      }
    | undefined;
}

function decided(h: Harness): string[] {
  return (
    h.Database.Raw.prepare(
      "SELECT publication_id FROM triage_decision ORDER BY publication_id",
    ).all() as Array<{ publication_id: string }>
  ).map((row) => row.publication_id);
}

/** The publications still without a triage decision. */
function waiting(h: Harness, ids: string[]): string[] {
  const done = new Set(decided(h));
  return ids.filter((id) => !done.has(id));
}

const budgetStops = (alerts: AlertEvent[]) => alerts.filter((a) => a.Type === "budget-stop");

describe("REQ-NFR-005: the budget stop with a stubbed gateway and a low budget", () => {
  it("REQ-NFR-005: AC2 new steps are refused once the budget is reached, and the stop time is kept", async () => {
    const { h, ai, ids } = await setup(5, [OK, OK, OK, OK, OK], BUDGET_FOR_THREE_CALLS);

    // Three calls fit under the limit; the fourth and fifth publications wait.
    expect(ai.Calls).toHaveLength(3);
    expect(decided(h)).toHaveLength(3);
    const day = budgetDay(h, "2026-10-30");
    expect(day?.limit_amount).toBe(BUDGET_FOR_THREE_CALLS);
    expect(day?.spent_amount).toBeGreaterThanOrEqual(BUDGET_FOR_THREE_CALLS);
    expect(day?.stopped_at).toBe("2026-10-30T06:00:00.000Z");
    expect(waiting(h, ids)).toHaveLength(2);
    for (const id of waiting(h, ids)) {
      expect(
        h.Database.Raw.prepare(
          "SELECT failure_class, count FROM redrive WHERE item_id = ? AND step = 'triage'",
        ).get(id),
      ).toEqual({ failure_class: "transient", count: 0 });
    }
  });

  it("REQ-NFR-005: AC2 a step that has started finishes its retries after the limit is reached", async () => {
    // The first attempt alone uses up the budget; its retry still runs (model-calls.md, rule 1).
    const { h, ai, ids } = await setup(2, [INVALID, OK], 0.00001);
    expect(ai.Calls).toHaveLength(2);
    expect(decided(h)).toHaveLength(1);
    expect(ids).toHaveLength(2);
    expect(budgetDay(h, "2026-10-30")?.stopped_at).toBe("2026-10-30T06:00:00.000Z");
  });

  it("REQ-NFR-019: AC1 sends one budget-stop alert a day however many steps are refused", async () => {
    const { h, alerts } = await setup(5, [OK, OK, OK, OK, OK], BUDGET_FOR_THREE_CALLS);
    expect(budgetStops(alerts)).toHaveLength(1);
    // The admission cron of the same day is refused again and sends nothing more.
    await dailyCron(h, "2026-10-30");
    expect(budgetStops(alerts)).toHaveLength(1);
    expect(budgetDay(h, "2026-10-30")?.alerted_at).toBe("2026-10-30T06:00:00.000Z");

    const [alert] = budgetStops(alerts);
    expect(alert).toMatchObject({ Type: "budget-stop", Source: "budget" });
    expect(alert?.Summary).toContain("2026-10-30");
    expect(alert?.Summary).toContain("0.0000 of 0.0000 EUR");
  });

  it("REQ-NFR-005: AC2 the admission cron admits nothing and uses up no re-drive on a stopped day", async () => {
    const { h, ids } = await setup(5, [OK, OK, OK, OK, OK], BUDGET_FOR_THREE_CALLS);
    await dailyCron(h, "2026-10-30");
    const admitted = h.Database.Raw.prepare(
      "SELECT COUNT(*) AS n FROM triage_decision WHERE admitted_on IS NOT NULL",
    ).get() as { n: number };
    expect(admitted.n).toBe(0);
    expect(waiting(h, ids)).toHaveLength(2);
    for (const id of waiting(h, ids)) {
      expect(
        h.Database.Raw.prepare(
          "SELECT count FROM redrive WHERE item_id = ? AND step = 'triage'",
        ).get(id),
      ).toEqual({ count: 0 });
    }
  });

  it("REQ-NFR-005: AC2 the next day queues the deferred steps again and they complete", async () => {
    const { h, ai, ids, alerts } = await setup(5, [OK, OK, OK, OK, OK], BUDGET_FOR_THREE_CALLS);
    await dailyCron(h, "2026-10-30");
    expect(decided(h)).toHaveLength(3);

    await dailyCron(h, "2026-10-31");
    expect(waiting(h, ids)).toEqual([]);
    expect(ai.Calls).toHaveLength(5);
    // The new day has its own row and has not stopped.
    expect(budgetDay(h, "2026-10-31")).toMatchObject({
      limit_amount: BUDGET_FOR_THREE_CALLS,
      stopped_at: null,
      alerted_at: null,
    });
    expect(budgetStops(alerts)).toHaveLength(1);
  });
});

describe("REQ-NFR-005: the day's limit is computed once and stored", () => {
  it("REQ-NFR-005: AC1 the first use of a day writes its computed limit, and later uses read it", async () => {
    const test = createTestDatabase();
    const computed: string[] = [];
    const store = createModelUsageStore(test.Db, {
      Limit: (day) => {
        computed.push(day);
        return Promise.resolve({ Amount: 1.25, Currency: "EUR" });
      },
    });
    expect(await store.budgetAllows("2026-11-23")).toBe(true);
    expect(await store.budgetAllows("2026-11-23")).toBe(true);
    // A second isolate finds the stored limit and computes nothing.
    const other = createModelUsageStore(test.Db, {
      Limit: () => Promise.reject(new Error("computed twice")),
    });
    expect(await other.budgetAllows("2026-11-23")).toBe(true);
    expect(computed).toEqual(["2026-11-23"]);
    expect(test.Raw.prepare("SELECT limit_amount, spent_amount FROM budget_day").all()).toEqual([
      { limit_amount: 1.25, spent_amount: 0 },
    ]);
  });
});
