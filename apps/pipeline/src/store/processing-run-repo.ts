import { type SqlDatabase } from "./sql.js";

/**
 * The `daily` processing run of a UTC day (ADR 0054): created by the first step that needs it
 * and found by every later one, through the unique (kind, day) index. Triage and extraction
 * calls and decisions of the day carry its ID.
 */
export async function dailyRunId(
  db: SqlDatabase,
  day: string,
  now: string,
  newId: () => string,
): Promise<string> {
  await db
    .prepare(
      "INSERT INTO processing_run (id, kind, day, status, started_at) VALUES (?, 'daily', ?, 'running', ?) ON CONFLICT DO NOTHING",
    )
    .bind(`prun_${newId()}`, day, now)
    .run();
  const row = await db
    .prepare("SELECT id FROM processing_run WHERE kind = 'daily' AND day = ?")
    .bind(day)
    .first<{ id: string }>();
  if (!row) {
    throw new Error(`no daily processing run for ${day}`);
  }
  return row.id;
}
