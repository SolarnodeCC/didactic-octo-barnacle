import { type QueueMessageEnvelope } from "@roi/models";

import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

export type ClaimResult = "claimed" | "duplicate" | "dead-lettered";

type LogRow = { status: string };

const MAX_ERROR_LENGTH = 500;

/**
 * Consumers claim a message before they work (REQ-DATA-011 AC1). A message that is
 * already `completed` is a repeated delivery and is skipped, so processing the same
 * message twice gives the same stored result.
 */
export async function claimMessage(
  db: SqlDatabase,
  envelope: QueueMessageEnvelope,
  now: string,
): Promise<ClaimResult> {
  const row = await db
    .prepare("SELECT status FROM queue_message_log WHERE message_id = ?")
    .bind(envelope.MessageId)
    .first<LogRow>();

  if (row?.status === "completed") {
    return "duplicate";
  }
  if (row?.status === "dead-lettered") {
    return "dead-lettered";
  }
  if (row) {
    await db
      .prepare(
        "UPDATE queue_message_log SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE message_id = ?",
      )
      .bind(now, envelope.MessageId)
      .run();
    return "claimed";
  }

  await db
    .prepare(
      "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, updated_at, created_at, payload_json) VALUES (?, ?, ?, ?, 'processing', 1, 0, ?, ?, ?)",
    )
    .bind(
      `qml_${envelope.MessageId}`,
      envelope.MessageId,
      envelope.Type,
      envelope.SchemaVersion,
      now,
      now,
      JSON.stringify(envelope),
    )
    .run();
  return "claimed";
}

/**
 * Statement that marks a message completed; callers put it in the batch with the work.
 * A note records why a message was completed without doing its work (for example a
 * PDF that is not a PDF), so the reason stays visible in the log.
 */
export function completeStatement(
  db: SqlDatabase,
  messageId: string,
  now: string,
  note: string | null = null,
): SqlStatement {
  return db
    .prepare(
      "UPDATE queue_message_log SET status = 'completed', last_error = ?, updated_at = ? WHERE message_id = ?",
    )
    .bind(note === null ? null : note.slice(0, MAX_ERROR_LENGTH), now, messageId);
}

/** Error text is cut short and holds only our own messages: no publication text. */
export async function markFailed(
  db: SqlDatabase,
  messageId: string,
  error: unknown,
  now: string,
): Promise<void> {
  const text = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
  await db
    .prepare(
      "UPDATE queue_message_log SET status = 'failed', last_error = ?, updated_at = ? WHERE message_id = ?",
    )
    .bind(text, now, messageId)
    .run();
}
