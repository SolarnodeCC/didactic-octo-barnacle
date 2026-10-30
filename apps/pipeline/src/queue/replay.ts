import { QueueMessageEnvelopeSchema } from "@roi/models";

import { type PipelineDeps } from "./deps.js";
import { getRun } from "../store/run-repo.js";

export type ReplayOutcome = "replayed" | "not-dead-lettered" | "unknown-message";

/**
 * Sends a dead-lettered message again with its original ID (REQ-DATA-011 AC4). Because
 * consumers claim by message ID and writes are idempotent, a replay cannot create
 * duplicates. The HTTP route `POST /admin/queue/replay` wraps this function with the
 * admin API in phase 4 (REQ-ADM-004).
 */
export async function replayDeadLetter(
  deps: PipelineDeps,
  messageId: string,
): Promise<ReplayOutcome> {
  const row = await deps.Db.prepare(
    "SELECT status, payload_json FROM queue_message_log WHERE message_id = ?",
  )
    .bind(messageId)
    .first<{ status: string; payload_json: string | null }>();
  if (!row) {
    return "unknown-message";
  }
  if (row.status !== "dead-lettered" || row.payload_json === null) {
    return "not-dead-lettered";
  }

  const envelope = {
    ...QueueMessageEnvelopeSchema.parse(JSON.parse(row.payload_json)),
    Attempt: 0,
  };
  const now = deps.Now();
  const run = envelope.Ids.RunId ? await getRun(deps.Db, envelope.Ids.RunId) : null;

  const statements = [
    deps.Db.prepare(
      "UPDATE queue_message_log SET status = 'pending', dead_letter = 0, attempts = 0, last_error = NULL, updated_at = ? WHERE message_id = ?",
    ).bind(now, messageId),
  ];
  if (run && run.Status === "failed") {
    // The run stopped at this message; reopen it so the page can finish the run.
    statements.push(
      deps.Db.prepare(
        "UPDATE ingestion_run SET status = 'running', ended_at = NULL WHERE id = ?",
      ).bind(run.Id),
    );
  }
  await deps.Db.batch(statements);

  try {
    await deps.Queue.send(envelope);
  } catch (error) {
    // Put the message back in the dead-letter state so it can be replayed again.
    await deps.Db.prepare(
      "UPDATE queue_message_log SET status = 'dead-lettered', dead_letter = 1, updated_at = ? WHERE message_id = ?",
    )
      .bind(deps.Now(), messageId)
      .run();
    if (run && run.Status === "failed") {
      await deps.Db.prepare("UPDATE ingestion_run SET status = 'failed', ended_at = ? WHERE id = ?")
        .bind(now, run.Id)
        .run();
    }
    throw error;
  }
  deps.Log?.("dead_letter.replayed", { messageId, runId: envelope.Ids.RunId });
  return "replayed";
}
