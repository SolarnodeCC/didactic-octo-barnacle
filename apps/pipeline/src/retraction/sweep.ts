import { deletePublicationVectors } from "@roi/vector-store";

import { type PipelineDeps } from "../queue/deps.js";
import { addRunCountStatements } from "../recovery/redrive-repo.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlStatement } from "../store/sql.js";

/** D1 allows 100 bound values per query. */
const CHUNK = 50;

export type SweepCounts = {
  /** Retracted publications handled by this sweep. */
  RetractionsHandled: number;
  /** Their candidates, hidden with reason `retracted`. */
  CandidatesHidden: number;
  /** Their triage decisions still waiting for admission, now decided as `retracted`. */
  DecisionsWithdrawn: number;
  /** Publications whose vectors were deleted from every index (REQ-DATA-008 AC3). */
  VectorsDeleted: number;
};

/**
 * The daily retraction sweep (REQ-DATA-008 AC2, ADR 0015), run first in the admission cron. A
 * publication flagged as retracted or withdrawn, by ingestion or by the weekly check, and not yet
 * handled:
 *
 * - has its candidates hidden with `hidden_reason = retracted`;
 * - has a triage decision still awaiting admission decided as `retracted`, so it is never admitted;
 * - is stamped `retraction_handled_at`, so a repeated sweep changes nothing.
 *
 * - has its vectors deleted from every index of the registry, first (REQ-DATA-008 AC3).
 *
 * Its opportunities are hidden the same way once the `opportunity` table exists (WP10). The
 * embedding consumer never embeds a retracted publication.
 */
export async function sweepRetractions(deps: PipelineDeps, day: string): Promise<SweepCounts> {
  const db = deps.Db;
  const now = deps.Now();
  const counts: SweepCounts = {
    RetractionsHandled: 0,
    CandidatesHidden: 0,
    DecisionsWithdrawn: 0,
    VectorsDeleted: 0,
  };
  const vectorIndexes = Object.values(deps.Embedding?.Indexes ?? {});
  const { results } = await db
    .prepare(
      "SELECT id FROM publication WHERE retracted = 1 AND retraction_handled_at IS NULL ORDER BY id",
    )
    .all<{ id: string }>();
  const ids = results.map((row) => row.id);

  for (let start = 0; start < ids.length; start += CHUNK) {
    const slice = ids.slice(start, start + CHUNK);
    const marks = slice.map(() => "?").join(", ");
    const hidden = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM candidate WHERE hidden_reason IS NULL AND publication_id IN (${marks})`,
      )
      .bind(...slice)
      .first<{ n: number }>();
    const waiting = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM triage_decision
         WHERE status = 'awaiting-admission' AND publication_id IN (${marks})`,
      )
      .bind(...slice)
      .first<{ n: number }>();
    // Vectors first, from every index: a failed delete leaves the publication unstamped, so the
    // next sweep tries again (REQ-DATA-008 AC3, REQ-PROC-002 AC2, ADR 0056).
    if (vectorIndexes.length > 0) {
      await deletePublicationVectors(vectorIndexes, slice);
      counts.VectorsDeleted += slice.length;
    }
    const statements: SqlStatement[] = [
      db
        .prepare(
          `UPDATE candidate SET hidden_reason = 'retracted'
           WHERE hidden_reason IS NULL AND publication_id IN (${marks})`,
        )
        .bind(...slice),
      db
        .prepare(
          `UPDATE triage_decision SET status = 'decided', reason = 'retracted', updated_at = ?
           WHERE status = 'awaiting-admission' AND publication_id IN (${marks})`,
        )
        .bind(now, ...slice),
      db
        .prepare(
          `UPDATE publication SET retraction_handled_at = ?
           WHERE retraction_handled_at IS NULL AND id IN (${marks})`,
        )
        .bind(now, ...slice),
    ];
    await db.batch(statements);
    counts.RetractionsHandled += slice.length;
    counts.CandidatesHidden += hidden?.n ?? 0;
    counts.DecisionsWithdrawn += waiting?.n ?? 0;
  }

  if (ids.length > 0) {
    const runId = await dailyRunId(db, day, now, deps.NewId);
    await db.batch(addRunCountStatements(db, runId, counts));
  }
  deps.Log?.("retraction.sweep", { day, ...counts });
  return counts;
}
