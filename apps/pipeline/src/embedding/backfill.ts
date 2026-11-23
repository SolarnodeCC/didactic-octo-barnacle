import { searchPublications, type SearchOptions, type SearchResult } from "@roi/vector-store";

import { embedEnvelope, type PipelineDeps } from "../queue/deps.js";
import { SEND_BATCH_LIMIT } from "../queue/types.js";
import { addRunCountStatements } from "../recovery/redrive-repo.js";
import { registryIndexes } from "../store/embedding-index-repo.js";

/** Publications queued per index and run, so one cron invocation stays short. */
export const BACKFILL_PER_RUN = 5_000;

export type BackfillProgress = {
  IndexId: string;
  Queued: number;
  /** Publications, not retracted, that still have no vector in this index. */
  Remaining: number;
  Done: boolean;
};

/**
 * The backfill of a new embedding index (REQ-PROC-001 AC2, ADR 0056). A model change adds its
 * index to the registry by a reviewed migration, with `backfill_started_at` set and `current` off,
 * and binds it as `PUBLICATION_VECTORS_NEXT`. From then on the admission cron continues the
 * backfill each day: it queues `publication.embed` against the new index for up to
 * `BACKFILL_PER_RUN` publications without a vector there, sending again a message that ended
 * without one. When every publication that is not retracted has its vector, it sets
 * `backfill_done_at`. Search keeps reading the current index until a reviewed change marks the
 * new one current; new publications are embedded in both meanwhile.
 */
export async function continueEmbeddingBackfills(
  deps: PipelineDeps,
  day: string,
): Promise<BackfillProgress[]> {
  const embedding = deps.Embedding;
  if (!embedding?.Queue) {
    return [];
  }
  const db = deps.Db;
  const { results: open } = await db
    .prepare(
      `SELECT id FROM embedding_index
       WHERE backfill_started_at IS NOT NULL AND backfill_done_at IS NULL ORDER BY id`,
    )
    .all<{ id: string }>();
  const entries = await registryIndexes(db, embedding.Environment);
  const progress: BackfillProgress[] = [];
  for (const { id: indexId } of open) {
    const entry = entries.find((candidate) => candidate.Id === indexId);
    if (!entry || !embedding.Indexes[entry.Binding]) {
      deps.Log?.("embedding.backfill_unbound", { indexId });
      continue;
    }
    const now = deps.Now();
    const { results: missing } = await db
      .prepare(
        `SELECT p.id, q.status FROM publication p
         LEFT JOIN queue_message_log q ON q.message_id = 'embed:' || p.id || ':' || ?
         WHERE p.retracted = 0
           AND NOT EXISTS (SELECT 1 FROM embedding e
                           WHERE e.publication_id = p.id AND e.embedding_index_id = ?)
           AND (q.status IS NULL OR q.status NOT IN ('pending', 'processing'))
         ORDER BY p.id LIMIT ?`,
      )
      .bind(indexId, indexId, BACKFILL_PER_RUN)
      .all<{ id: string; status: string | null }>();
    // A message that ended without a vector is reopened, since its ID is fixed (ADR 0056).
    const reopen = missing.filter((row) => row.status !== null).map((row) => row.id);
    for (let start = 0; start < reopen.length; start += 50) {
      const slice = reopen.slice(start, start + 50);
      await db
        .prepare(
          `UPDATE queue_message_log SET status = 'pending', attempts = 0, last_error = NULL,
             dead_letter = 0, updated_at = ?
           WHERE message_id IN (${slice.map(() => "?").join(", ")})`,
        )
        .bind(now, ...slice.map((id) => `embed:${id}:${indexId}`))
        .run();
    }
    for (let start = 0; start < missing.length; start += SEND_BATCH_LIMIT) {
      await embedding.Queue.sendBatch(
        missing
          .slice(start, start + SEND_BATCH_LIMIT)
          .map((row) => ({ body: embedEnvelope(row.id, indexId) })),
      );
    }
    const remaining = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM publication p WHERE p.retracted = 0
           AND NOT EXISTS (SELECT 1 FROM embedding e
                           WHERE e.publication_id = p.id AND e.embedding_index_id = ?)`,
      )
      .bind(indexId)
      .first<{ n: number }>();
    const done = (remaining?.n ?? 0) === 0;
    const runId = `bf_${indexId}`;
    await db.batch([
      db
        .prepare(
          `INSERT INTO processing_run (id, kind, day, status, started_at)
           VALUES (?, 'backfill', ?, 'running', ?) ON CONFLICT (id) DO NOTHING`,
        )
        .bind(runId, day, now),
      ...addRunCountStatements(db, runId, { Queued: missing.length }),
      ...(done
        ? [
            db
              .prepare("UPDATE embedding_index SET backfill_done_at = ? WHERE id = ?")
              .bind(now, indexId),
            db
              .prepare(
                "UPDATE processing_run SET status = 'succeeded', ended_at = ? WHERE id = ? AND status = 'running'",
              )
              .bind(now, runId),
          ]
        : []),
    ]);
    deps.Log?.("embedding.backfill", { indexId, queued: missing.length, remaining: remaining?.n });
    progress.push({
      IndexId: indexId,
      Queued: missing.length,
      Remaining: remaining?.n ?? 0,
      Done: done,
    });
  }
  return progress;
}

/**
 * Semantic search on the current index of the registry (REQ-PROC-003 AC1, AC2): a backfilling
 * index is never read until a reviewed change marks it current (REQ-PROC-001 AC2).
 */
export async function searchCurrentIndex(
  deps: PipelineDeps,
  query: string,
  options: SearchOptions,
  runId: string,
): Promise<SearchResult> {
  const embedding = deps.Embedding;
  if (!embedding) {
    throw new Error("embedding is not configured in this Worker");
  }
  const current = (await registryIndexes(deps.Db, embedding.Environment)).find((e) => e.Current);
  const index = current ? embedding.Indexes[current.Binding] : undefined;
  if (!current || !index) {
    throw new Error("no current embedding index is bound in this Worker");
  }
  return searchPublications(
    { Call: embedding.Call, Current: { Entry: current, Index: index }, RunId: runId },
    query,
    options,
  );
}
