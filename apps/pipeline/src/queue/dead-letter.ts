import { QueueMessageEnvelopeSchema } from "@roi/models";

import { notify } from "../alerts/notify.js";
import { type PipelineDeps } from "./deps.js";
import { reportForAlert } from "../report/safe-report.js";
import {
  addCounts,
  appendFailures,
  emptyCounts,
  finishRunStatement,
  getRun,
} from "../store/run-repo.js";

const MAX_ERROR_LENGTH = 500;

export type DeadLetterOutcome = "recorded" | "already-recorded" | "unreadable";

/**
 * Consumer of the dead-letter queue. It records the message as dead-lettered, counts
 * it in its run, and closes that run as `failed`: the run cannot continue without the
 * page, and a failed run does not move the window (REQ-DATA-011 AC3).
 */
export async function handleDeadLetter(
  deps: PipelineDeps,
  body: unknown,
  reason = "retries exhausted",
): Promise<DeadLetterOutcome> {
  const parsed = QueueMessageEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    deps.Log?.("dead_letter.unreadable", { issues: parsed.error.issues.length });
    await notify(deps, {
      Type: "dead-letter",
      Source: "unknown",
      Summary: "A message that could not be read was dead-lettered and cannot be replayed.",
    });
    return "unreadable";
  }
  const envelope = parsed.data;
  const now = deps.Now();

  const existing = await deps.Db.prepare(
    "SELECT status, last_error FROM queue_message_log WHERE message_id = ?",
  )
    .bind(envelope.MessageId)
    .first<{ status: string; last_error: string | null }>();
  if (existing?.status === "dead-lettered") {
    return "already-recorded";
  }

  // The consumer stored the error of the last failed attempt (`markFailed`); keep it, so
  // the cause of a dead letter is not replaced by a generic reason.
  const detail = existing?.last_error ? `${reason}; last error: ${existing.last_error}` : reason;

  const statements = [
    existing
      ? deps.Db.prepare(
          "UPDATE queue_message_log SET status = 'dead-lettered', dead_letter = 1, last_error = ?, updated_at = ? WHERE message_id = ?",
        ).bind(detail.slice(0, MAX_ERROR_LENGTH), now, envelope.MessageId)
      : deps.Db.prepare(
          "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, last_error, updated_at, created_at, payload_json) VALUES (?, ?, ?, ?, 'dead-lettered', 0, 1, ?, ?, ?, ?)",
        ).bind(
          `qml_${envelope.MessageId}`,
          envelope.MessageId,
          envelope.Type,
          envelope.SchemaVersion,
          detail.slice(0, MAX_ERROR_LENGTH),
          now,
          now,
          JSON.stringify(envelope),
        ),
  ];

  const runId = envelope.Ids.RunId;
  const run = runId ? await getRun(deps.Db, runId) : null;
  const closesRun = run?.Status === "running";
  if (run && closesRun) {
    const counts = addCounts(run.Counts, { ...emptyCounts(), DeadLettered: 1 });
    const failures = appendFailures(run.Failures, [
      { SourceId: null, Reason: `message ${envelope.MessageId} dead-lettered: ${detail}` },
    ]);
    statements.push(
      deps.Db.prepare(
        "UPDATE ingestion_run SET counts_json = ?, failures_json = ? WHERE id = ?",
      ).bind(JSON.stringify(counts), JSON.stringify(failures), run.Id),
      finishRunStatement(deps.Db, {
        Id: run.Id,
        Status: "failed",
        EndedAt: now,
        WindowEnd: run.StartedAt.slice(0, 10),
      }),
    );
  }

  await deps.Db.batch(statements);
  deps.Log?.("dead_letter.recorded", { messageId: envelope.MessageId, runId, reason: detail });

  // A PDF that a publisher's server fails to deliver is routine (about 1% a day on staging).
  // It stays recorded and counted, but alerts only when the day's share crosses a threshold
  // (ADR 0073, REQ-NFR-019 AC1).
  if (envelope.Type === "document.ingest") {
    await notifyDocumentRate(deps, now);
    return "recorded";
  }

  const report = runId ? await reportForAlert(deps, runId, now) : null;
  await notify(deps, {
    Type: "dead-letter",
    Source: envelope.Ids.Source ?? envelope.Type,
    ...(runId ? { RunId: runId } : {}),
    MessageId: envelope.MessageId,
    Summary: `A ${envelope.Type} message was dead-lettered after its retries${closesRun ? "; its run was closed as failed" : ""}. Cause: ${detail}`,
    ...(report ? { Report: report } : {}),
  });
  return "recorded";
}

/**
 * Raises one `pdf-dead-letter-rate` alert on the dead letter that lifts the share of
 * dead-lettered `document.ingest` messages of this UTC day above `Pdf.DeadLetterAlertShare`,
 * once the day has at least `Pdf.DeadLetterAlertMinMessages` messages (ADR 0073). The
 * summary carries counts only (REQ-NFR-019 AC4).
 */
async function notifyDocumentRate(deps: PipelineDeps, now: string): Promise<void> {
  const { DeadLetterAlertShare: share, DeadLetterAlertMinMessages: minMessages } = deps.Config.Pdf;
  const day = now.slice(0, 10);
  const counts = await deps.Db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'dead-lettered' THEN 1 ELSE 0 END) AS dead FROM queue_message_log WHERE type = 'document.ingest' AND substr(updated_at, 1, 10) = ?",
  )
    .bind(day)
    .first<{ total: number; dead: number | null }>();
  const total = counts?.total ?? 0;
  const dead = counts?.dead ?? 0;
  if (total < minMessages || dead < 1) {
    return;
  }
  const crossed = dead / total > share && (dead - 1) / total <= share;
  if (!crossed) {
    return;
  }
  const percent = ((dead / total) * 100).toFixed(1);
  await notify(deps, {
    Type: "pdf-dead-letter-rate",
    Source: "document.ingest",
    Summary: `${dead} of ${total} PDF messages on ${day} (${percent}%) were dead-lettered, above the ${(share * 100).toFixed(0)}% threshold.`,
  });
}
