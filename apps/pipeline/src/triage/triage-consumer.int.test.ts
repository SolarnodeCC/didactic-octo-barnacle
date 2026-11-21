import { FakeWorkersAi, type FakeReply, type TriageSignals } from "@roi/models";
import { TRIAGE_PROMPT_VERSION } from "@roi/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleTriage } from "./triage-consumer.js";
import { triageEnvelope } from "../queue/deps.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import {
  arxivPage,
  createHarness,
  makeEntry,
  makeWork,
  openAlexPage,
  type Harness,
} from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const ARXIV_CRON = "30 7 * * *";
const TRIAGE_MODEL = DEFAULT_PROCESSING_CONFIG.TriageModel.Model;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function signals(values: Partial<TriageSignals>): TriageSignals {
  return {
    NamedParty: false,
    StatedHarm: false,
    Trigger: false,
    ExistingAlternative: false,
    Adoptable: false,
    ...values,
  };
}

/** A valid triage answer with the given signals. */
function answer(
  values: Partial<TriageSignals>,
  notes: string | null = "deciding signals",
): FakeReply {
  return { Kind: "output", Output: { Signals: signals(values), Notes: notes } };
}

const PASSING = { NamedParty: true, StatedHarm: true, Adoptable: true };

type DecisionRow = {
  publication_id: string;
  run_id: string;
  status: string;
  accepted: number;
  score: number | null;
  reason: string | null;
  signal_named_party: number | null;
  signal_stated_harm: number | null;
  signal_trigger: number | null;
  signal_existing_alternative: number | null;
  signal_adoptable: number | null;
  notes: string | null;
  model: string | null;
  prompt_version: string | null;
  admitted_on: string | null;
};

function decisions(h: Harness): DecisionRow[] {
  return h.Database.Raw.prepare(
    `SELECT publication_id, run_id, status, accepted, score, reason, signal_named_party,
            signal_stated_harm, signal_trigger, signal_existing_alternative, signal_adoptable,
            notes, model, prompt_version, admitted_on
     FROM triage_decision ORDER BY publication_id`,
  ).all() as DecisionRow[];
}

function publicationIds(h: Harness): string[] {
  return (
    h.Database.Raw.prepare("SELECT id FROM publication ORDER BY id").all() as Array<{ id: string }>
  ).map((row) => row.id);
}

function triageMessages(h: Harness) {
  return h.Queue.sent.filter(
    (sent) => (sent.body as { Type: string }).Type === "publication.triage",
  );
}

function messageNote(
  h: Harness,
  publicationId: string,
): { status: string; last_error: string | null } {
  return h.Database.Raw.prepare(
    "SELECT status, last_error FROM queue_message_log WHERE message_id = ?",
  ).get(`triage:${publicationId}`) as { status: string; last_error: string | null };
}

/** Stores OpenAlex works without triaging them, so a test can change them first. */
async function storeWorks(h: Harness, count: number): Promise<string[]> {
  h.SetOpenAlexPages([
    openAlexPage(
      Array.from({ length: count }, (_, i) => makeWork(i + 1)),
      null,
    ),
  ]);
  await runScheduled(h.Deps, OPENALEX_CRON);
  await h.Drain();
  return publicationIds(h);
}

async function triageAll(h: Harness, ids: string[]): Promise<void> {
  for (const id of ids) {
    await h.Queue.send(triageEnvelope(id));
  }
  await h.Drain();
}

describe("REQ-PROC-005: triage rules before any model call", () => {
  it("REQ-PROC-005: AC1 rejects retracted, incomplete, and out-of-scope publications with their reason and no model call (REQ-PROC-006 AC1)", async () => {
    const ai = new FakeWorkersAi([]);
    const h = createHarness({}, { Triage: { Ai: ai, Send: false } });
    const [retracted, incomplete, outOfScope] = await storeWorks(h, 3);
    const raw = h.Database.Raw;
    raw.prepare("UPDATE publication SET retracted = 1 WHERE id = ?").run(retracted);
    raw.prepare("UPDATE publication SET completeness = 'incomplete' WHERE id = ?").run(incomplete);
    raw
      .prepare("UPDATE publication SET topics_json = ? WHERE id = ?")
      .run(JSON.stringify(["Astronomy and Astrophysics"]), outOfScope);

    await triageAll(h, [retracted ?? "", incomplete ?? "", outOfScope ?? ""]);

    expect(ai.Calls).toHaveLength(0);
    const byId = new Map(decisions(h).map((row) => [row.publication_id, row]));
    expect(byId.get(retracted ?? "")?.reason).toBe("retracted");
    expect(byId.get(incomplete ?? "")?.reason).toBe("incomplete");
    expect(byId.get(outOfScope ?? "")?.reason).toBe("out-of-scope");
    for (const row of byId.values()) {
      // A rule rejection has no signals, score, model, or prompt version (REQ-PROC-006 AC2).
      expect(row).toMatchObject({
        status: "decided",
        accepted: 0,
        score: null,
        signal_named_party: null,
        model: null,
        prompt_version: null,
      });
    }
  });

  it("REQ-PROC-006: AC1 a preprint filed only under a cross-industry category is in scope and goes to the model", async () => {
    const ai = new FakeWorkersAi([answer(PASSING)]);
    const h = createHarness({}, { Triage: { Ai: ai } });
    h.SetArxivPages([arxivPage([makeEntry(1, "2026-10-29T10:00:00Z")])]);
    await runScheduled(h.Deps, ARXIV_CRON);
    await h.Drain();

    expect(ai.Calls).toHaveLength(1);
    expect(decisions(h)[0]).toMatchObject({ status: "awaiting-admission", reason: null });
  });
});

describe("REQ-PROC-008: the model reads signals, code decides", () => {
  it("REQ-PROC-008: AC2 AC3 scores the signals, holds passing publications for admission, and stores low-score ones (REQ-PROC-006 AC2)", async () => {
    const ai = new FakeWorkersAi([
      answer(PASSING),
      answer({ NamedParty: false, StatedHarm: true, Trigger: true, Adoptable: true }),
    ]);
    const h = createHarness({}, { Triage: { Ai: ai } });
    h.SetOpenAlexPages([openAlexPage([makeWork(1), makeWork(2)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    expect(triageMessages(h)).toHaveLength(2);
    const [first, second] = decisions(h);
    expect(first).toMatchObject({
      status: "awaiting-admission",
      accepted: 0,
      score: 0.6,
      reason: null,
      signal_named_party: 1,
      signal_stated_harm: 1,
      signal_trigger: 0,
      signal_existing_alternative: 0,
      signal_adoptable: 1,
      notes: "deciding signals",
      model: TRIAGE_MODEL,
      prompt_version: TRIAGE_PROMPT_VERSION,
      admitted_on: null,
    });
    // Three of five signals, but no named party: the signal rule fails.
    expect(second).toMatchObject({ status: "decided", score: 0.6, reason: "low-score" });

    // The calls and decisions belong to the daily run of the UTC day (REQ-PROC-006 AC4).
    const run = h.Database.Raw.prepare("SELECT id, kind, day FROM processing_run").all() as Array<{
      id: string;
      kind: string;
      day: string;
    }>;
    expect(run).toEqual([{ id: first?.run_id, kind: "daily", day: h.Clock.Now.slice(0, 10) }]);
    const calls = h.Database.Raw.prepare(
      "SELECT run_id, step_name, outcome, model FROM model_call",
    ).all();
    expect(calls).toEqual([
      { run_id: first?.run_id, step_name: "triage", outcome: "ok", model: TRIAGE_MODEL },
      { run_id: first?.run_id, step_name: "triage", outcome: "ok", model: TRIAGE_MODEL },
    ]);
    // The prompt went through the environment's AI Gateway (REQ-NFR-003).
    expect(ai.Calls[0]?.Options.gateway).toMatchObject({ id: "roi-test" });
  });

  it("REQ-PROC-008: AC1 an answer that adds a score or decision is invalid, and no decision is stored", async () => {
    const invalid: FakeReply = {
      Kind: "output",
      Output: { Signals: signals(PASSING), Notes: null, TriageScore: 1, Accepted: true },
    };
    const ai = new FakeWorkersAi([invalid, invalid, invalid]);
    const h = createHarness({}, { Triage: { Ai: ai, Send: false } });
    const [id] = await storeWorks(h, 1);
    await triageAll(h, [id ?? ""]);

    expect(ai.Calls).toHaveLength(DEFAULT_PROCESSING_CONFIG.ModelMaxAttempts);
    expect(decisions(h)).toEqual([]);
    expect(messageNote(h, id ?? "")).toMatchObject({ status: "completed" });
    expect(messageNote(h, id ?? "").last_error).toMatch(/^failed: invalid-output/);
  });
});

describe("REQ-PROC-005: one decision per publication", () => {
  it("REQ-PROC-005: delivering every message twice stores one decision and calls the model once each", async () => {
    const ai = new FakeWorkersAi([answer(PASSING), answer(PASSING)]);
    const h = createHarness({}, { Triage: { Ai: ai } });
    h.SetOpenAlexPages([openAlexPage([makeWork(1), makeWork(2)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ Duplicate: true });

    expect(decisions(h)).toHaveLength(2);
    expect(ai.Calls).toHaveLength(2);
  });

  it("REQ-PROC-005: a new message for a publication that has a decision changes nothing", async () => {
    const ai = new FakeWorkersAi([answer(PASSING)]);
    const h = createHarness({}, { Triage: { Ai: ai, Send: false } });
    const [id] = await storeWorks(h, 1);
    await triageAll(h, [id ?? ""]);
    const before = decisions(h);

    const again = { ...triageEnvelope(id ?? ""), MessageId: `triage:${id}:again` };
    expect(await handleTriage(h.Deps, again)).toBe("already-triaged");
    expect(decisions(h)).toEqual(before);
    expect(ai.Calls).toHaveLength(1);
  });
});

describe("REQ-NFR-005: triage and the daily budget", () => {
  it("REQ-NFR-005: AC2 with the budget used up, triage makes no call, stores no decision, and records budget-deferred", async () => {
    const ai = new FakeWorkersAi([answer(PASSING)]);
    const h = createHarness({}, { Triage: { Ai: ai, Send: false, BudgetEur: 0 } });
    const [id] = await storeWorks(h, 1);
    await triageAll(h, [id ?? ""]);

    expect(ai.Calls).toHaveLength(0);
    expect(decisions(h)).toEqual([]);
    expect(messageNote(h, id ?? "")).toEqual({
      status: "completed",
      last_error: "budget-deferred",
    });
  });
});

describe("REQ-PROC-005: triage messages only where processing is on", () => {
  it("REQ-PROC-005: with processing off, stored publications get no triage message", async () => {
    const ai = new FakeWorkersAi([]);
    const h = createHarness({}, { Triage: { Ai: ai, Send: false } });
    await storeWorks(h, 2);

    expect(triageMessages(h)).toEqual([]);
    expect(decisions(h)).toEqual([]);
  });

  it("REQ-PROC-005: a publication stored again by a later run is not queued for triage again", async () => {
    const ai = new FakeWorkersAi([answer(PASSING)]);
    const h = createHarness({}, { Triage: { Ai: ai } });
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    expect(triageMessages(h)).toHaveLength(1);
    expect(ai.Calls).toHaveLength(1);
  });
});
