import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sweepRetractions } from "./sweep.js";
import { ADMISSION_CRON } from "../config.js";
import { DEFAULT_PROCESSING_CONFIG } from "../processing-config.js";
import { extractEnvelope } from "../queue/deps.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const DAY_1 = "2026-10-30";
const DAY_2 = "2026-10-31";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PROVIDER_ERROR: FakeReply = { Kind: "error", Status: 503 };

/** Stores `count` publications, each with a triage decision in the given state. */
async function setup(
  states: Array<"accepted" | "awaiting">,
  replies: FakeReply[] = [],
): Promise<{ h: Harness; ai: FakeWorkersAi; ids: string[] }> {
  const ai = new FakeWorkersAi(replies);
  const h = createHarness(
    {},
    { Triage: { Ai: new FakeWorkersAi([]), Send: false }, Extraction: { Ai: ai } },
  );
  h.SetOpenAlexPages([
    openAlexPage(
      states.map((_, i) => makeWork(i + 1)),
      null,
    ),
  ]);
  await runScheduled(h.Deps, OPENALEX_CRON);
  await h.Drain();
  const ids = (
    h.Database.Raw.prepare("SELECT id FROM publication ORDER BY id").all() as Array<{ id: string }>
  ).map((row) => row.id);
  ids.forEach((id, index) => {
    const accepted = states[index] === "accepted";
    h.Database.Raw.prepare(
      `INSERT INTO triage_decision (id, publication_id, run_id, status, accepted, score, reason,
         signal_named_party, signal_stated_harm, signal_trigger, signal_existing_alternative,
         signal_adoptable, notes, model, prompt_version, admitted_on, created_at, updated_at)
       VALUES (?, ?, 'run_seed', ?, ?, 0.8, ?, 1, 1, 1, 1, 0, NULL,
         '@cf/google/gemma-4-26b-a4b-it', 'triage@2', ?, ?, ?)`,
    ).run(
      `tri_${id}`,
      id,
      accepted ? "decided" : "awaiting-admission",
      accepted ? 1 : 0,
      accepted ? "accepted" : null,
      accepted ? DAY_1 : null,
      `${DAY_1}T06:00:00.000Z`,
      `${DAY_1}T06:00:00.000Z`,
    );
  });
  return { h, ai, ids };
}

/** Stores an extraction result with one candidate for the publication, as WP7 does. */
function withCandidate(h: Harness, publicationId: string): void {
  h.Database.Raw.prepare(
    `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
       confidence, notes, candidate_count, created_at)
     VALUES (?, ?, 'run_seed', '@cf/deepseek-ai/deepseek-v4.1-flash-1017', 'extraction@4',
       'abstract', 0.6, NULL, 1, ?)`,
  ).run(`ext_${publicationId}`, publicationId, `${DAY_1}T10:00:00.000Z`);
  h.Database.Raw.prepare(
    `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
       customer, customer_quote, created_at)
     VALUES (?, ?, ?, 'A finding.', 'A quote.', 'grid operators', 'Grid operators', ?)`,
  ).run(`cand_${publicationId}`, publicationId, `ext_${publicationId}`, `${DAY_1}T10:00:00.000Z`);
}

function retract(h: Harness, publicationId: string): void {
  h.Database.Raw.prepare("UPDATE publication SET retracted = 1 WHERE id = ?").run(publicationId);
}

function decision(h: Harness, publicationId: string) {
  return h.Database.Raw.prepare(
    "SELECT status, accepted, reason, admitted_on FROM triage_decision WHERE publication_id = ?",
  ).get(publicationId) as { status: string; accepted: number; reason: string | null };
}

describe("REQ-DATA-008: the daily retraction sweep", () => {
  it("REQ-DATA-008 AC2: candidates of a retracted publication are hidden with the reason, and it is not admitted", async () => {
    const { h, ids } = await setup(["accepted", "awaiting", "awaiting"]);
    const [extracted, waiting, untouched] = ids as [string, string, string];
    withCandidate(h, extracted);
    retract(h, extracted);
    retract(h, waiting);

    h.Clock.Now = `${DAY_2}T11:00:00.000Z`;
    const counts = await sweepRetractions(h.Deps, DAY_2);
    expect(counts).toEqual({
      RetractionsHandled: 2,
      CandidatesHidden: 1,
      DecisionsWithdrawn: 1,
      VectorsDeleted: 0,
    });

    const candidate = h.Database.Raw.prepare(
      "SELECT hidden_reason FROM candidate WHERE publication_id = ?",
    ).get(extracted) as { hidden_reason: string | null };
    expect(candidate.hidden_reason).toBe("retracted");
    expect(decision(h, waiting)).toMatchObject({
      status: "decided",
      accepted: 0,
      reason: "retracted",
    });
    expect(decision(h, untouched)).toMatchObject({ status: "awaiting-admission", reason: null });

    const handled = h.Database.Raw.prepare(
      "SELECT id, retraction_handled_at FROM publication ORDER BY id",
    ).all() as Array<{ id: string; retraction_handled_at: string | null }>;
    expect(handled.map((row) => row.retraction_handled_at !== null)).toEqual([true, true, false]);
    const run = h.Database.Raw.prepare(
      "SELECT counts_json FROM processing_run WHERE kind = 'daily' AND day = ?",
    ).get(DAY_2) as { counts_json: string };
    expect(JSON.parse(run.counts_json)).toMatchObject({
      RetractionsHandled: 2,
      CandidatesHidden: 1,
      DecisionsWithdrawn: 1,
    });
  });

  it("REQ-DATA-008 AC2: a repeated sweep changes nothing", async () => {
    const { h, ids } = await setup(["accepted"]);
    const [id] = ids as [string];
    withCandidate(h, id);
    retract(h, id);
    h.Clock.Now = `${DAY_2}T11:00:00.000Z`;
    await sweepRetractions(h.Deps, DAY_2);
    const before = h.Database.Raw.prepare("SELECT retraction_handled_at FROM publication").get();
    h.Clock.Now = `${DAY_2}T12:00:00.000Z`;
    expect(await sweepRetractions(h.Deps, DAY_2)).toEqual({
      RetractionsHandled: 0,
      CandidatesHidden: 0,
      DecisionsWithdrawn: 0,
      VectorsDeleted: 0,
    });
    expect(h.Database.Raw.prepare("SELECT retraction_handled_at FROM publication").get()).toEqual(
      before,
    );
  });

  it("REQ-DATA-008: the admission cron sweeps first, so a retracted publication is never admitted", async () => {
    const { h, ids } = await setup(["awaiting", "awaiting"]);
    const [retracted, kept] = ids as [string, string];
    retract(h, retracted);
    h.Clock.Now = `${DAY_2}T11:00:00.000Z`;
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(decision(h, retracted)).toMatchObject({ accepted: 0, reason: "retracted" });
    expect(decision(h, kept)).toMatchObject({ accepted: 1, reason: "accepted" });
    const sent = h.Queue.sent.map((m) => (m.body as { MessageId: string }).MessageId);
    expect(sent).toContain(`extract:${kept}`);
    expect(sent).not.toContain(`extract:${retracted}`);
  });
});

describe("REQ-DATA-008: a publication retracted after admission goes no further", () => {
  it("REQ-DATA-008: it is not extracted and no model is called", async () => {
    const { h, ai, ids } = await setup(["accepted"]);
    const [id] = ids as [string];
    retract(h, id);
    h.Clock.Now = `${DAY_1}T12:00:00.000Z`;
    await h.Queue.send(extractEnvelope(id));
    await h.Drain();
    expect(ai.Calls).toHaveLength(0);
    expect(h.Count("extraction_result")).toBe(0);
    const log = h.Database.Raw.prepare(
      "SELECT last_error FROM queue_message_log WHERE message_id = ?",
    ).get(`extract:${id}`) as { last_error: string };
    expect(log.last_error).toBe("retracted");
  });

  it("REQ-DATA-008: a failed extraction is not re-driven once the publication is retracted", async () => {
    const failing = Array.from(
      { length: DEFAULT_PROCESSING_CONFIG.ModelMaxAttempts },
      () => PROVIDER_ERROR,
    );
    const { h, ai, ids } = await setup(["accepted"], failing);
    const [id] = ids as [string];
    h.Clock.Now = `${DAY_1}T12:00:00.000Z`;
    await h.Queue.send(extractEnvelope(id));
    await h.Drain();
    expect(ai.Calls).toHaveLength(failing.length);
    retract(h, id);

    h.Queue.sent.length = 0;
    h.Clock.Now = `${DAY_2}T11:00:00.000Z`;
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(h.Queue.sent).toEqual([]);
    expect(ai.Calls).toHaveLength(failing.length);
  });
});
