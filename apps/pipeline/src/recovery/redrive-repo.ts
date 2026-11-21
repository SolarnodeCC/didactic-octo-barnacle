import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

/** How a step ended without a stored result (ADR 0063). */
export type FailureClass = "transient" | "content";

export type FailedStep = {
  ItemKind: "publication" | "candidate";
  ItemId: string;
  Step: string;
  Class: FailureClass;
  /** Model and prompt version of the failed attempt; a content failure waits for a change. */
  Model: string | null;
  PromptVersion: string | null;
};

/**
 * Records a step that ended without a result, for the daily re-drive (REQ-PROC-010). One row
 * per item and step: a later failure updates its class, time, model, and prompt version, and
 * keeps the number of re-drives made so far.
 */
export function recordFailureStatement(
  db: SqlDatabase,
  failure: FailedStep,
  now: string,
  id: string,
): SqlStatement {
  return db
    .prepare(
      `INSERT INTO redrive (id, item_kind, item_id, step, failure_class, last_failed_at,
         last_model, last_prompt_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (item_kind, item_id, step) DO UPDATE SET
         failure_class = excluded.failure_class,
         last_failed_at = excluded.last_failed_at,
         last_model = excluded.last_model,
         last_prompt_version = excluded.last_prompt_version,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      failure.ItemKind,
      failure.ItemId,
      failure.Step,
      failure.Class,
      now,
      failure.Model,
      failure.PromptVersion,
      now,
      now,
    );
}

/**
 * Adds entries to the `failures_json` of a processing run, once each (REQ-NFR-008): the run
 * report lists failed-final items and dead letters whose replays are used up.
 */
export async function addRunFailures(
  db: SqlDatabase,
  runId: string,
  failures: Array<{ PublicationId: string | null; Reason: string }>,
): Promise<void> {
  if (failures.length === 0) {
    return;
  }
  const row = await db
    .prepare("SELECT failures_json FROM processing_run WHERE id = ?")
    .bind(runId)
    .first<{ failures_json: string }>();
  const listed = JSON.parse(row?.failures_json ?? "[]") as Array<{
    PublicationId: string | null;
    Reason: string;
  }>;
  const seen = new Set(listed.map((entry) => `${entry.PublicationId ?? ""}|${entry.Reason}`));
  for (const failure of failures) {
    const key = `${failure.PublicationId ?? ""}|${failure.Reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      listed.push(failure);
    }
  }
  await db
    .prepare("UPDATE processing_run SET failures_json = ? WHERE id = ?")
    .bind(JSON.stringify(listed), runId)
    .run();
}

/** Adds counts to a processing run's `counts_json`. */
export async function addRunCounts(
  db: SqlDatabase,
  runId: string,
  counts: Record<string, number>,
): Promise<void> {
  const row = await db
    .prepare("SELECT counts_json FROM processing_run WHERE id = ?")
    .bind(runId)
    .first<{ counts_json: string }>();
  const merged = JSON.parse(row?.counts_json ?? "{}") as Record<string, number>;
  for (const [key, value] of Object.entries(counts)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  await db
    .prepare("UPDATE processing_run SET counts_json = ? WHERE id = ?")
    .bind(JSON.stringify(merged), runId)
    .run();
}
