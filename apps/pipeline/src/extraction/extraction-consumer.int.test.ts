import { ALL_CANDIDATES_FAILED_NOTE, FakeWorkersAi, type FakeReply } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMISSION_CRON } from "../config.js";
import { textKey } from "../documents/object-store.js";
import { extractEnvelope } from "../queue/deps.js";
import { replayDeadLetter } from "../queue/replay.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const DAY = "2026-10-30";

const ABSTRACT =
  "Hospital billing departments spend weeks reconciling “insurance claims” by hand. New EU rules require audit trails from 2027. Today clerks use spreadsheets.";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

type Candidate = {
  Finding: string;
  EvidenceQuote: string;
  Customer: string;
  CustomerQuote: string;
  WhyNow: string | null;
  WhyNowQuote: string | null;
  CurrentAlternative: string | null;
  AlternativeQuote: string | null;
};

const CANDIDATE: Candidate = {
  Finding: "Hospital billing departments lose weeks to manual claim reconciliation.",
  // Straight quotes where the abstract has curly ones: matches after normalisation (ADR 0064).
  EvidenceQuote: 'Hospital billing departments spend weeks reconciling "insurance claims" by hand.',
  Customer: "hospital billing departments",
  CustomerQuote: "Hospital billing departments",
  WhyNow: null,
  WhyNowQuote: null,
  CurrentAlternative: "Spreadsheets.",
  AlternativeQuote: "Today clerks use spreadsheets.",
};

function answer(candidates: Candidate[], confidence = 0.9, notes: string | null = null): FakeReply {
  return {
    Kind: "output",
    Output: { Candidates: candidates, Confidence: confidence, Notes: notes },
  };
}

/** Stores publications with a known abstract and an accepted triage decision each. */
async function setup(
  count: number,
  replies: FakeReply[],
  options: {
    BudgetEur?: number;
    Send?: boolean;
    FullTextMaxChars?: number;
    Accepted?: boolean;
  } = {},
): Promise<{ h: Harness; ai: FakeWorkersAi; ids: string[] }> {
  const ai = new FakeWorkersAi(replies);
  const h = createHarness(
    {},
    {
      Triage: { Ai: new FakeWorkersAi([]), Send: false },
      Extraction: {
        Ai: ai,
        ...(options.Send === false ? { Send: false } : {}),
        ...(options.BudgetEur === undefined ? {} : { BudgetEur: options.BudgetEur }),
        ...(options.FullTextMaxChars === undefined
          ? {}
          : { FullTextMaxChars: options.FullTextMaxChars }),
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
  const accepted = options.Accepted ?? true;
  for (const id of ids) {
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
      accepted ? "decided" : "awaiting-admission",
      accepted ? 1 : 0,
      accepted ? "accepted" : null,
      accepted ? DAY : null,
      `${DAY}T06:00:00.000Z`,
      `${DAY}T06:00:00.000Z`,
    );
  }
  h.Clock.Now = `${DAY}T11:00:00.000Z`;
  return { h, ai, ids };
}

async function extract(h: Harness, id: string): Promise<void> {
  await h.Queue.send(extractEnvelope(id));
  await h.Drain();
}

function withFullText(h: Harness, publicationId: string, text: string): void {
  const documentId = `doc_${publicationId}`;
  h.Database.Raw.prepare(
    `INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license,
       extracted_text_r2_key, extractor_version, status, stored_at)
     VALUES (?, ?, ?, ?, 'cc-by', ?, 'unpdf@2.2.1', 'text-extracted', ?)`,
  ).run(
    documentId,
    publicationId,
    `pdfs/${documentId}.pdf`,
    `hash_${documentId}`,
    textKey(documentId),
    `${DAY}T07:00:00.000Z`,
  );
  h.Bucket.objects.set(textKey(documentId), {
    bytes: new TextEncoder().encode(text),
    contentType: "text/plain",
    license: "cc-by",
  });
}

type ResultRow = {
  input_mode: string;
  confidence: number;
  notes: string | null;
  candidate_count: number;
  model: string;
  prompt_version: string;
};

function result(h: Harness, id: string): ResultRow | undefined {
  return h.Database.Raw.prepare(
    "SELECT input_mode, confidence, notes, candidate_count, model, prompt_version FROM extraction_result WHERE publication_id = ?",
  ).get(id) as ResultRow | undefined;
}

function candidates(h: Harness, id: string): Array<Record<string, string | null>> {
  return h.Database.Raw.prepare("SELECT * FROM candidate WHERE publication_id = ? ORDER BY id").all(
    id,
  ) as Array<Record<string, string | null>>;
}

function note(h: Harness, id: string): string | null {
  const row = h.Database.Raw.prepare(
    "SELECT status, last_error FROM queue_message_log WHERE message_id = ?",
  ).get(`extract:${id}`) as { status: string; last_error: string | null } | undefined;
  return row?.last_error ?? null;
}

function counts(h: Harness): Record<string, number> {
  const row = h.Database.Raw.prepare(
    "SELECT counts_json FROM processing_run WHERE kind = 'daily' AND day = ?",
  ).get(DAY) as { counts_json: string } | undefined;
  return JSON.parse(row?.counts_json ?? "{}") as Record<string, number>;
}

describe("REQ-PROC-004: the extraction consumer", () => {
  it("REQ-PROC-004 AC1: each candidate references its publication with a finding and evidence quote", async () => {
    const { h, ids } = await setup(1, [answer([CANDIDATE])]);
    const [id] = ids as [string];
    await extract(h, id);

    expect(result(h, id)).toMatchObject({
      candidate_count: 1,
      model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
      prompt_version: "extraction@4",
    });
    const [stored] = candidates(h, id);
    expect(stored).toMatchObject({
      publication_id: id,
      finding: CANDIDATE.Finding,
      customer: "hospital billing departments",
      hidden_reason: null,
    });
    // REQ-AGENT-008 AC2: the stored quote is the matched source span, with its curly quotes.
    expect(stored?.evidence_quote).toBe(
      "Hospital billing departments spend weeks reconciling “insurance claims” by hand.",
    );
    expect(h.Database.Raw.prepare("SELECT step_name FROM model_call").all()).toEqual([
      { step_name: "extraction" },
    ]);
  });

  it("REQ-PROC-004 AC2: an empty list is stored with its Notes reason", async () => {
    const { h, ids } = await setup(1, [answer([], 0.5, "No customer that can act is named.")]);
    const [id] = ids as [string];
    await extract(h, id);
    expect(result(h, id)).toMatchObject({
      candidate_count: 0,
      notes: "No customer that can act is named.",
    });
    expect(candidates(h, id)).toEqual([]);
    expect(counts(h)).toMatchObject({ Extracted: 1, ExtractedWithoutCandidate: 1 });
  });

  it("REQ-PROC-004 AC2: up to the configured maximum of candidates is stored; more is invalid", async () => {
    const second = { ...CANDIDATE, Customer: "insurance claim clerks", CustomerQuote: "clerks" };
    const four = [CANDIDATE, second, CANDIDATE, second];
    const { h, ids } = await setup(2, [
      answer([CANDIDATE, second, CANDIDATE]),
      answer(four),
      answer(four),
      answer(four),
    ]);
    const [first, other] = ids as [string, string];
    await extract(h, first);
    expect(candidates(h, first)).toHaveLength(3);
    await extract(h, other);
    expect(result(h, other)).toBeUndefined();
    expect(note(h, other)).toMatch(/^failed: invalid-output/u);
  });

  it("REQ-PROC-009 AC2: WhyNow stays empty when the text gives no quote for it", async () => {
    const { h, ids } = await setup(1, [answer([CANDIDATE])]);
    const [id] = ids as [string];
    await extract(h, id);
    expect(candidates(h, id)[0]).toMatchObject({ why_now: null, why_now_quote: null });
  });

  it("REQ-PROC-009 AC3, AC4, AC7: failing candidates are dropped on the last attempt, the others kept", async () => {
    const generic = { ...CANDIDATE, Customer: "users" };
    const invented = { ...CANDIDATE, EvidenceQuote: "Claims cost hospitals millions." };
    const reply = answer([CANDIDATE, generic, invented]);
    const { h, ai, ids } = await setup(1, [reply, reply, reply]);
    const [id] = ids as [string];
    await extract(h, id);

    expect(ai.Calls).toHaveLength(3);
    const retry = ai.Calls[1]?.Inputs.messages as Array<{ content: string }>;
    expect(retry.at(-1)?.content).toContain("Candidates[1].Customer");
    expect(retry.at(-1)?.content).toContain("Candidates[2].EvidenceQuote");
    expect(candidates(h, id).map((c) => c.customer)).toEqual(["hospital billing departments"]);
    expect(counts(h)).toMatchObject({
      CandidatesStored: 1,
      CandidatesDropped: 2,
      DroppedQuote: 1,
      DroppedGenericCustomer: 1,
    });
  });

  it("REQ-PROC-009 AC7: when every candidate fails, the result is empty and Notes says so", async () => {
    const reply = answer([{ ...CANDIDATE, Customer: "the public" }]);
    const { h, ids } = await setup(1, [reply, reply, reply]);
    const [id] = ids as [string];
    await extract(h, id);
    expect(result(h, id)).toMatchObject({ candidate_count: 0, notes: ALL_CANDIDATES_FAILED_NOTE });
  });

  it("REQ-DATA-006 AC3: abstract input is recorded and caps Confidence at 0.7", async () => {
    const { h, ai, ids } = await setup(1, [answer([CANDIDATE], 0.95)]);
    const [id] = ids as [string];
    await extract(h, id);
    expect(result(h, id)).toMatchObject({ input_mode: "abstract", confidence: 0.7 });
    const prompt = ai.Calls[0]?.Inputs.messages as Array<{ content: string }>;
    expect(prompt[1]?.content).toContain("Input: abstract only.");
    expect(counts(h)).toMatchObject({ ExtractedOnAbstract: 1 });
  });

  it("REQ-DATA-006 AC3: stored full text is read, recorded, and is the text the quotes are checked against", async () => {
    const fullText = `${"Background. ".repeat(10)}Grid operators lose transformers to undetected faults. ${"x".repeat(200)} The tail is cut off.`;
    const quote = {
      ...CANDIDATE,
      EvidenceQuote: "Grid operators lose transformers to undetected faults.",
      Customer: "grid operators",
      CustomerQuote: "Grid operators",
      CurrentAlternative: null,
      AlternativeQuote: null,
    };
    const tail = { ...quote, EvidenceQuote: "The tail is cut off." };
    // The cut keeps the first 300 characters, so a quote from the tail is not in the text sent.
    const { h, ai, ids } = await setup(
      1,
      [answer([quote, tail], 0.95)].concat([
        answer([quote, tail], 0.95),
        answer([quote, tail], 0.95),
      ]),
      {
        FullTextMaxChars: 300,
      },
    );
    const [id] = ids as [string];
    withFullText(h, id, fullText);
    await extract(h, id);

    expect(result(h, id)).toMatchObject({ input_mode: "full-text", confidence: 0.95 });
    expect(candidates(h, id).map((c) => c.evidence_quote)).toEqual([quote.EvidenceQuote]);
    const prompt = ai.Calls[0]?.Inputs.messages as Array<{ content: string }>;
    expect(prompt[1]?.content).toContain("Input: full text.");
    expect(prompt[1]?.content).not.toContain("The tail is cut off.");
    expect(counts(h)).toMatchObject({ ExtractedOnFullText: 1 });
  });

  it("REQ-DATA-006 AC3: a failed text falls back to the abstract", async () => {
    const { h, ids } = await setup(1, [answer([CANDIDATE])]);
    const [id] = ids as [string];
    h.Database.Raw.prepare(
      `INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, status, stored_at)
       VALUES ('doc_1', ?, 'pdfs/doc_1.pdf', 'hash_1', 'cc-by', 'text-failed', ?)`,
    ).run(id, `${DAY}T07:00:00.000Z`);
    await extract(h, id);
    expect(result(h, id)).toMatchObject({ input_mode: "abstract" });
  });

  it("REQ-PROC-010 AC4: a budget-refused extraction completes as budget-deferred and is recorded for re-drive", async () => {
    const { h, ai, ids } = await setup(1, [answer([CANDIDATE])], { BudgetEur: 0 });
    const [id] = ids as [string];
    await extract(h, id);
    expect(ai.Calls).toHaveLength(0);
    expect(result(h, id)).toBeUndefined();
    expect(note(h, id)).toBe("budget-deferred");
    expect(
      h.Database.Raw.prepare("SELECT step, failure_class FROM redrive WHERE item_id = ?").all(id),
    ).toEqual([{ step: "extraction", failure_class: "transient" }]);
  });

  it("REQ-PROC-010 AC7: a repeated message stores no second result or candidate", async () => {
    const { h, ai, ids } = await setup(1, [answer([CANDIDATE]), answer([CANDIDATE])]);
    const [id] = ids as [string];
    await extract(h, id);
    // A new message ID for the same publication still finds the stored result.
    await h.Queue.send({ ...extractEnvelope(id), MessageId: `extract:${id}:again` });
    await h.Drain({ Duplicate: true });
    expect(ai.Calls).toHaveLength(1);
    expect(h.Count("extraction_result")).toBe(1);
    expect(h.Count("candidate")).toBe(1);
  });

  it("REQ-PROC-005: a publication that was not admitted is not extracted", async () => {
    const { h, ai, ids } = await setup(1, [answer([CANDIDATE])], { Accepted: false });
    const [id] = ids as [string];
    await extract(h, id);
    expect(ai.Calls).toHaveLength(0);
    expect(note(h, id)).toBe("not admitted");
  });
});

describe("REQ-PROC-005: the admission cron queues extraction", () => {
  it("REQ-PROC-005 AC2: admitted publications get one extract message each, sent once", async () => {
    const { h, ids } = await setup(2, [answer([CANDIDATE]), answer([CANDIDATE])]);
    h.Queue.sent.length = 0;
    await runScheduled(h.Deps, ADMISSION_CRON);
    const sent = h.Queue.sent.map((m) => (m.body as { MessageId: string }).MessageId);
    expect(sent.filter((m) => m.startsWith("extract:")).sort()).toEqual(
      ids.map((id) => `extract:${id}`).sort(),
    );
    await h.Drain();
    expect(h.Count("extraction_result")).toBe(2);

    // A second trigger finds every admitted publication extracted and sends nothing.
    h.Queue.sent.length = 0;
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(h.Queue.sent).toEqual([]);
  });

  it("REQ-PROC-005: with processing off no extract message is sent", async () => {
    const { h } = await setup(1, [], { Send: false });
    h.Queue.sent.length = 0;
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(h.Queue.sent).toEqual([]);
  });

  it("REQ-NFR-005 AC2: with the day's budget used up no extract message is sent", async () => {
    const { h } = await setup(1, [], { BudgetEur: 0 });
    h.Queue.sent.length = 0;
    await runScheduled(h.Deps, ADMISSION_CRON);
    expect(h.Queue.sent).toEqual([]);
  });
});

describe("REQ-DATA-012: a dead-lettered extract message is replayed to the model queue", () => {
  it("REQ-DATA-012: replay sends it back and the extraction completes once", async () => {
    const { h, ids } = await setup(1, [answer([CANDIDATE])]);
    const [id] = ids as [string];
    h.Database.Raw.prepare(
      `INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts,
         dead_letter, payload_json, created_at, updated_at)
       VALUES ('qml_1', ?, 'publication.extract', '1', 'dead-lettered', 4, 1, ?, ?, ?)`,
    ).run(
      `extract:${id}`,
      JSON.stringify(extractEnvelope(id)),
      `${DAY}T10:00:00.000Z`,
      `${DAY}T10:00:00.000Z`,
    );
    h.Queue.sent.length = 0;
    expect(await replayDeadLetter(h.Deps, `extract:${id}`)).toBe("replayed");
    expect(h.Queue.sent).toHaveLength(1);
    await h.Drain();
    expect(h.Count("extraction_result")).toBe(1);
  });
});
