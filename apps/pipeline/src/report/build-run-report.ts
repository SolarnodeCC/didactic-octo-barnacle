import { RunReportSchema, type RunReport } from "@roi/models";

import { sanitizeReason } from "./sanitize.js";
import { getRun } from "../store/run-repo.js";
import { type SqlDatabase } from "../store/sql.js";

/** `document.ingest` completes with `<code>: <message>` when a file can never be fetched. */
const PDF_FAILURE_PREFIXES = [
  "blocked-url",
  "too-large",
  "timeout",
  "not-pdf",
  "http-status",
  "too-many-redirects",
  "network",
];

async function count(db: SqlDatabase, sql: string, values: string[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * The run report of one ingestion run (REQ-NFR-008 AC2): counts and failed items from the
 * run, the messages that were dead-lettered, and data-quality counters for the time the
 * run was open. It holds IDs, counts, and short reasons, never publication text.
 */
export async function buildRunReport(
  db: SqlDatabase,
  runId: string,
  now: string,
): Promise<RunReport | null> {
  const run = await getRun(db, runId);
  if (!run) {
    return null;
  }
  const from = run.StartedAt;
  const to = run.EndedAt ?? now;

  const dead = await db
    .prepare(
      `SELECT message_id FROM queue_message_log
       WHERE status = 'dead-lettered'
         AND (message_id LIKE ? OR (type = 'document.ingest' AND updated_at >= ? AND updated_at <= ?))
       ORDER BY message_id`,
    )
    .bind(`fetch:${runId}:%`, from, to)
    .all<{ message_id: string }>();

  const pdfLike = PDF_FAILURE_PREFIXES.map(() => "last_error LIKE ?").join(" OR ");
  const failedPdfs = await count(
    db,
    `SELECT COUNT(*) AS n FROM queue_message_log
     WHERE type = 'document.ingest' AND updated_at >= ? AND updated_at <= ?
       AND (status = 'dead-lettered' OR (status = 'completed' AND (${pdfLike})))`,
    [from, to, ...PDF_FAILURE_PREFIXES.map((prefix) => `${prefix}:%`)],
  );

  return RunReportSchema.parse({
    RunId: run.Id,
    Source: run.Source,
    Status: run.Status,
    StartedAt: run.StartedAt,
    EndedAt: run.EndedAt,
    WindowFrom: run.WindowFrom,
    PagesDone: run.PagesDone,
    Counts: run.Counts,
    Failures: run.Failures.map((failure) => ({
      SourceId: failure.SourceId ?? null,
      Reason: sanitizeReason(failure.Reason),
    })),
    DeadLetteredMessages: dead.results.map((row) => row.message_id),
    DataQuality: {
      IncompleteRecords: await count(
        db,
        "SELECT COUNT(*) AS n FROM publication WHERE completeness = 'incomplete' AND updated_at >= ? AND updated_at <= ?",
        [from, to],
      ),
      DuplicatesFlagged: await count(
        db,
        "SELECT COUNT(*) AS n FROM title_author_review WHERE created_at >= ? AND created_at <= ?",
        [from, to],
      ),
      FailedPdfs: failedPdfs,
    },
  });
}
