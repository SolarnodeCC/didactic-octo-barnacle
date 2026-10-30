import {
  type IngestionRunCounts,
  type IngestionRunFailure,
  type IngestionRunStatus,
  type SourceName,
} from "@roi/models";

import { type SqlDatabase, type SqlStatement } from "./sql.js";

/** Failures kept per run; the count in `Counts.Failed` stays exact. */
export const MAX_STORED_FAILURES = 100;

export type RunRow = {
  Id: string;
  Source: Extract<SourceName, "openalex" | "arxiv">;
  Status: IngestionRunStatus;
  StartedAt: string;
  EndedAt: string | null;
  WindowFrom: string | null;
  PageCursor: string | null;
  PagesDone: number;
  Counts: IngestionRunCounts;
  Failures: IngestionRunFailure[];
};

type DbRun = {
  id: string;
  source: RunRow["Source"];
  status: IngestionRunStatus;
  started_at: string;
  ended_at: string | null;
  window_from: string | null;
  page_cursor: string | null;
  pages_done: number;
  counts_json: string;
  failures_json: string;
};

export function emptyCounts(): IngestionRunCounts {
  return { Fetched: 0, Created: 0, Updated: 0, Skipped: 0, Failed: 0, DeadLettered: 0 };
}

export function addCounts(left: IngestionRunCounts, right: IngestionRunCounts): IngestionRunCounts {
  return {
    Fetched: left.Fetched + right.Fetched,
    Created: left.Created + right.Created,
    Updated: left.Updated + right.Updated,
    Skipped: left.Skipped + right.Skipped,
    Failed: left.Failed + right.Failed,
    DeadLettered: left.DeadLettered + right.DeadLettered,
  };
}

export function appendFailures(
  current: IngestionRunFailure[],
  added: IngestionRunFailure[],
): IngestionRunFailure[] {
  return [...current, ...added].slice(0, MAX_STORED_FAILURES);
}

const RUN_COLUMNS =
  "id, source, status, started_at, ended_at, window_from, page_cursor, pages_done, counts_json, failures_json";

function toRun(row: DbRun): RunRow {
  return {
    Id: row.id,
    Source: row.source,
    Status: row.status,
    StartedAt: row.started_at,
    EndedAt: row.ended_at,
    WindowFrom: row.window_from,
    PageCursor: row.page_cursor,
    PagesDone: row.pages_done,
    Counts: JSON.parse(row.counts_json) as IngestionRunCounts,
    Failures: JSON.parse(row.failures_json) as IngestionRunFailure[],
  };
}

export async function getRun(db: SqlDatabase, runId: string): Promise<RunRow | null> {
  const row = await db
    .prepare(`SELECT ${RUN_COLUMNS} FROM ingestion_run WHERE id = ?`)
    .bind(runId)
    .first<DbRun>();
  return row ? toRun(row) : null;
}

/** The newest run of a source that is still marked `running`, if any. */
export async function findRunningRun(
  db: SqlDatabase,
  source: RunRow["Source"],
): Promise<RunRow | null> {
  const row = await db
    .prepare(
      `SELECT ${RUN_COLUMNS} FROM ingestion_run WHERE source = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(source)
    .first<DbRun>();
  return row ? toRun(row) : null;
}

/** End of the window of the last successful run (REQ-DATA-009 AC1). */
export async function lastSuccessfulWindowEnd(
  db: SqlDatabase,
  source: RunRow["Source"],
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT cursor FROM ingestion_run WHERE source = ? AND status = 'succeeded' AND cursor IS NOT NULL ORDER BY started_at DESC LIMIT 1",
    )
    .bind(source)
    .first<{ cursor: string }>();
  return row?.cursor ?? null;
}

export async function createRun(
  db: SqlDatabase,
  run: { Id: string; Source: RunRow["Source"]; StartedAt: string; WindowFrom: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO ingestion_run (id, source, cursor, started_at, ended_at, counts_json, failures_json, status, window_from, page_cursor, pages_done) VALUES (?, ?, NULL, ?, NULL, ?, '[]', 'running', ?, NULL, 0)",
    )
    .bind(run.Id, run.Source, run.StartedAt, JSON.stringify(emptyCounts()), run.WindowFrom)
    .run();
}

/** Statement for one fetched page: counts, failures, and the next page cursor. */
export function recordPageStatement(
  db: SqlDatabase,
  run: RunRow,
  page: { Counts: IngestionRunCounts; Failures: IngestionRunFailure[]; NextCursor: string | null },
): SqlStatement {
  return db
    .prepare(
      "UPDATE ingestion_run SET counts_json = ?, failures_json = ?, page_cursor = ?, pages_done = ? WHERE id = ?",
    )
    .bind(
      JSON.stringify(addCounts(run.Counts, page.Counts)),
      JSON.stringify(appendFailures(run.Failures, page.Failures)),
      page.NextCursor,
      run.PagesDone + 1,
      run.Id,
    );
}

/**
 * Statement that closes a run. Only a `succeeded` run stores a window end, so a
 * partial or failed run is covered again by the next one (REQ-DATA-009 AC1).
 */
export function finishRunStatement(
  db: SqlDatabase,
  run: {
    Id: string;
    Status: Exclude<IngestionRunStatus, "running">;
    EndedAt: string;
    WindowEnd: string;
  },
): SqlStatement {
  return db
    .prepare("UPDATE ingestion_run SET status = ?, ended_at = ?, cursor = ? WHERE id = ?")
    .bind(run.Status, run.EndedAt, run.Status === "succeeded" ? run.WindowEnd : null, run.Id);
}
