import { FakeWorkersAi, type FakeReply } from "@roi/models";
import { FakeVectorize } from "@roi/vector-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continueEmbeddingBackfills, searchCurrentIndex } from "./backfill.js";
import { ADMISSION_CRON } from "../config.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage } from "../test/harness.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const NEXT = "idx_next_768";

describe("REQ-PROC-001: a model change backfills a new index while search keeps the current one", () => {
  it("REQ-PROC-001 AC2: the backfill fills the new index, and search reads it only after the cut-over", async () => {
    const replies: FakeReply[] = Array.from({ length: 6 }, () => ({ Kind: "embedding" }));
    const ai = new FakeWorkersAi(replies);
    const current = new FakeVectorize();
    const next = new FakeVectorize();
    const h = createHarness(
      {},
      {
        Embedding: {
          Ai: ai,
          Indexes: { PUBLICATION_VECTORS: current, PUBLICATION_VECTORS_NEXT: next },
        },
      },
    );
    h.SetOpenAlexPages([openAlexPage([makeWork(1), makeWork(2), makeWork(3)], null)]);
    await runScheduled(h.Deps, "0 6 * * *");
    await h.Drain();
    expect(current.Vectors.size).toBe(3);

    // The reviewed migration of a model change: the new index, backfilling, not current.
    h.Database.Raw.prepare(
      `INSERT INTO embedding_index (id, binding, vectorize_name, model_name, model_version,
         dimensions, metric, current, backfill_started_at)
       VALUES (?, 'PUBLICATION_VECTORS_NEXT', 'roi-publications-test-next',
         '@cf/baai/bge-base-en-v1.5', 'v1.5', 768, 'cosine', 0, '2026-10-30T12:00:00.000Z')`,
    ).run(NEXT);

    h.Clock.Now = "2026-10-31T11:00:00.000Z";
    await runScheduled(h.Deps, ADMISSION_CRON);
    await h.Drain();
    expect(next.Vectors.size).toBe(3);
    const rows = h.Database.Raw.prepare(
      "SELECT COUNT(*) AS n FROM embedding WHERE embedding_index_id = ?",
    ).get(NEXT) as { n: number };
    expect(rows.n).toBe(3);

    // Before the cut-over search reads the current index only.
    const before = await searchCurrentIndex(h.Deps, "research paper", { topK: 5 }, "run_search");
    expect(before.Ok && before.Hits).toHaveLength(3);
    expect(current.Queries).toHaveLength(1);
    expect(next.Queries).toHaveLength(0);

    // The next cron finds nothing left and marks the backfill done.
    h.Clock.Now = "2026-11-01T11:00:00.000Z";
    const [progress] = await continueEmbeddingBackfills(h.Deps, "2026-11-01");
    expect(progress).toMatchObject({ IndexId: NEXT, Queued: 0, Remaining: 0, Done: true });
    const index = h.Database.Raw.prepare(
      "SELECT backfill_done_at FROM embedding_index WHERE id = ?",
    ).get(NEXT) as { backfill_done_at: string | null };
    expect(index.backfill_done_at).toBe("2026-11-01T11:00:00.000Z");
    const run = h.Database.Raw.prepare(
      "SELECT kind, status, counts_json FROM processing_run WHERE id = ?",
    ).get(`bf_${NEXT}`) as { kind: string; status: string; counts_json: string };
    expect(run).toMatchObject({ kind: "backfill", status: "succeeded" });
    expect(JSON.parse(run.counts_json)).toEqual({ Queued: 3 });

    // The reviewed cut-over marks the new index current; search reads it from then on.
    h.Database.Raw.exec(
      `UPDATE embedding_index SET current = 0 WHERE current = 1;
       UPDATE embedding_index SET current = 1 WHERE id = '${NEXT}';`,
    );
    const after = await searchCurrentIndex(h.Deps, "research paper", { topK: 5 }, "run_search");
    expect(after.Ok && after.Hits).toHaveLength(3);
    expect(next.Queries).toHaveLength(1);
  });

  it("REQ-PROC-001 AC2: a backfill sends nothing with processing off", async () => {
    const h = createHarness({}, { Embedding: { Ai: new FakeWorkersAi([]), Send: false } });
    expect(await continueEmbeddingBackfills(h.Deps, "2026-10-31")).toEqual([]);
  });
});
