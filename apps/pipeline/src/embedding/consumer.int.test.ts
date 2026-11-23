import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { FakeVectorize } from "@roi/vector-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMISSION_CRON } from "../config.js";
import { embedEnvelope } from "../queue/deps.js";
import { sweepRetractions } from "../retraction/sweep.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { FIRST_INDEX_ID } from "../store/embedding-index-repo.js";
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

type Setup = {
  h: Harness;
  ai: FakeWorkersAi;
  ids: string[];
  indexes: Record<string, FakeVectorize>;
};

/** Ingests `count` works with embedding on (or with sending off), on the scripted replies. */
async function setup(
  count: number,
  replies: FakeReply[],
  options: { Send?: boolean; Next?: boolean } = {},
): Promise<Setup> {
  const ai = new FakeWorkersAi(replies);
  const indexes: Record<string, FakeVectorize> = {
    PUBLICATION_VECTORS: new FakeVectorize(),
    ...(options.Next ? { PUBLICATION_VECTORS_NEXT: new FakeVectorize() } : {}),
  };
  const h = createHarness(
    {},
    {
      Embedding: {
        Ai: ai,
        Indexes: indexes,
        ...(options.Send === false ? { Send: false } : {}),
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
  return { h, ai, ids, indexes };
}

function embeddings(h: Harness) {
  return h.Database.Raw.prepare(
    "SELECT publication_id, embedding_index_id, vectorize_id, model_name, model_version, input_kind FROM embedding ORDER BY publication_id",
  ).all() as Array<Record<string, string>>;
}

function note(h: Harness, publicationId: string): string | null {
  const row = h.Database.Raw.prepare(
    "SELECT last_error FROM queue_message_log WHERE message_id = ?",
  ).get(`embed:${publicationId}:${FIRST_INDEX_ID}`) as { last_error: string | null } | undefined;
  return row?.last_error ?? null;
}

describe("REQ-PROC-001: every ingested publication is embedded", () => {
  it("REQ-PROC-001 AC1 AC3: each publication gets one current embedding with model name and version, one call per batch", async () => {
    const { h, ai, ids, indexes } = await setup(3, [{ Kind: "embedding" }]);

    expect(ai.Calls).toHaveLength(1);
    expect((ai.Calls[0]?.Inputs.text as string[]).length).toBe(3);
    expect(ai.Calls[0]?.Options.gateway.id).toBe("roi-test");
    expect(h.Queue.deliveredBatches).toEqual([3]);
    expect(embeddings(h)).toEqual(
      ids.map((id) => ({
        publication_id: id,
        embedding_index_id: FIRST_INDEX_ID,
        vectorize_id: id,
        model_name: "@cf/baai/bge-base-en-v1.5",
        model_version: "v1.5",
        input_kind: "title-abstract",
      })),
    );
    // REQ-PROC-002 AC1: the vector is the publication's, with its source and date as metadata.
    const [first] = ids as [string];
    const vector = indexes.PUBLICATION_VECTORS?.Vectors.get(first);
    expect(vector?.values).toHaveLength(768);
    expect(vector?.metadata.source).toBe("openalex");
    expect(vector?.metadata.published_day).toBeGreaterThan(20000000);
    const registry = h.Database.Raw.prepare(
      "SELECT binding, vectorize_name, current FROM embedding_index",
    ).all();
    expect(registry).toEqual([
      { binding: "PUBLICATION_VECTORS", vectorize_name: "roi-publications-test", current: 1 },
    ]);
  });

  it("REQ-PROC-001 AC1: a publication without an abstract is embedded from its title and marked so", async () => {
    const { h, ai, ids } = await setup(1, [{ Kind: "embedding" }], { Send: false });
    const [id] = ids as [string];
    h.Database.Raw.prepare("UPDATE publication SET abstract = NULL WHERE id = ?").run(id);
    await h.Queue.send(embedEnvelope(id, FIRST_INDEX_ID));
    await h.Drain();
    expect(embeddings(h)[0]?.input_kind).toBe("title-only");
    expect((ai.Calls[0]?.Inputs.text as string[])[0]).not.toContain("\n\n");
  });

  it("REQ-PROC-010 AC7: a repeated message for an embedded publication adds nothing", async () => {
    const { h, ai, ids } = await setup(1, [{ Kind: "embedding" }]);
    const [id] = ids as [string];
    await h.Queue.send({ ...embedEnvelope(id, FIRST_INDEX_ID), MessageId: `embed:${id}:again` });
    await h.Drain();
    expect(ai.Calls).toHaveLength(1);
    expect(embeddings(h)).toHaveLength(1);
  });

  it("REQ-PROC-005: with processing off no embedding message is sent", async () => {
    const { h, ai } = await setup(2, [], { Send: false });
    expect(ai.Calls).toHaveLength(0);
    expect(
      h.Queue.sent.filter((m) => (m.body as { Type: string }).Type === "publication.embed"),
    ).toEqual([]);
  });
});

describe("REQ-PROC-010: refused embeddings are re-driven", () => {
  it("REQ-PROC-010 AC1 AC4: a budget-refused batch completes as budget-deferred and is embedded the next day", async () => {
    const ai = new FakeWorkersAi([{ Kind: "embedding" }]);
    const h = createHarness({}, { Embedding: { Ai: ai } });
    h.Database.Raw.prepare(
      "INSERT INTO budget_day (day, limit_amount, spent_amount, currency) VALUES (?, 1, 1, 'EUR')",
    ).run(DAY_1);
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    const [{ id }] = h.Database.Raw.prepare("SELECT id FROM publication").all() as [{ id: string }];
    expect(ai.Calls).toHaveLength(0);
    expect(note(h, id)).toBe("budget-deferred");
    expect(
      h.Database.Raw.prepare("SELECT step, failure_class FROM redrive WHERE item_id = ?").get(id),
    ).toEqual({ step: "embedding", failure_class: "transient" });

    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    await runScheduled(h.Deps, ADMISSION_CRON);
    await h.Drain();
    expect(ai.Calls).toHaveLength(1);
    expect(embeddings(h)).toHaveLength(1);
  });
});

describe("REQ-DATA-008: retracted publications have no vectors", () => {
  it("REQ-DATA-008: a retracted publication is not embedded", async () => {
    const { h, ai, ids } = await setup(1, [], { Send: false });
    const [id] = ids as [string];
    h.Database.Raw.prepare("UPDATE publication SET retracted = 1 WHERE id = ?").run(id);
    await h.Queue.send(embedEnvelope(id, FIRST_INDEX_ID));
    await h.Drain();
    expect(ai.Calls).toHaveLength(0);
    expect(note(h, id)).toBe("retracted");
  });

  it("REQ-DATA-008 AC3, REQ-PROC-002 AC2: the sweep deletes the vector of a retracted publication from every index", async () => {
    const { h, ids, indexes } = await setup(2, [{ Kind: "embedding" }], { Next: true });
    const [retracted, kept] = ids as [string, string];
    // The new index of a model change holds the same publications during its backfill.
    await indexes.PUBLICATION_VECTORS_NEXT?.upsert([
      ...(indexes.PUBLICATION_VECTORS?.Vectors.values() ?? []),
    ]);
    h.Database.Raw.prepare("UPDATE publication SET retracted = 1 WHERE id = ?").run(retracted);

    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    const counts = await sweepRetractions(h.Deps, "2026-10-31");
    expect(counts.VectorsDeleted).toBe(1);
    for (const index of Object.values(indexes)) {
      expect([...index.Vectors.keys()]).toEqual([kept]);
    }
  });
});
