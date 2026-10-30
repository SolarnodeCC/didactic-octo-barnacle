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
    "SELECT status FROM queue_message_log WHERE message_id = ?",
  )
    .bind(envelope.MessageId)
    .first<{ status: string }>();
  if (existing?.status === "dead-lettered") {
    return "already-recorded";
  }

  const statements = [
    existing
      ? deps.Db.prepare(
          "UPDATE queue_message_log SET status = 'dead-lettered', dead_letter = 1, last_error = ?, updated_at = ? WHERE message_id = ?",
        ).bind(reason, now, envelope.MessageId)
      : deps.Db.prepare(
          "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, last_error, updated_at, created_at, payload_json) VALUES (?, ?, ?, ?, 'dead-lettered', 0, 1, ?, ?, ?, ?)",
        ).bind(
          `qml_${envelope.MessageId}`,
          envelope.MessageId,
          envelope.Type,
          envelope.SchemaVersion,
          reason,
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
      { SourceId: null, Reason: `message ${envelope.MessageId} dead-lettered: ${reason}` },
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
  deps.Log?.("dead_letter.recorded", { messageId: envelope.MessageId, runId });
  const report = runId ? await reportForAlert(deps, runId, now) : null;
  await notify(deps, {
    Type: "dead-letter",
    Source: envelope.Ids.Source ?? envelope.Type,
    ...(runId ? { RunId: runId } : {}),
    MessageId: envelope.MessageId,
    Summary: `A ${envelope.Type} message was dead-lettered after its retries${closesRun ? "; its run was closed as failed" : ""}.`,
    ...(report ? { Report: report } : {}),
  });
  return "recorded";
}
