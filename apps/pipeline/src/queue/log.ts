import { type QueueMessageEnvelope } from "@roi/models";

import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

export type ClaimResult = "claimed" | "duplicate" | "dead-lettered";

type LogRow = { status: string };

const MAX_ERROR_LENGTH = 500;

/**
 * Consumers claim a message before they work (REQ-DATA-011 AC1). A message that is
 * already `completed` is a repeated delivery and is skipped, so processing the same
 * message twice gives the same stored result.
 *
 * The claim is one statement: it inserts the log row or, for a message seen before that
 * is neither completed nor dead-lettered, counts another attempt. Two deliveries of a new
 * message can then never both try to insert it, and the common case is one round trip.
 */
export async function claimMessage(
  db: SqlDatabase,
  envelope: QueueMessageEnvelope,
  now: string,
): Promise<ClaimResult> {
  const claimed = await db
    .prepare(
      "INSERT INTO queue_message_log (id, message_id, type, schema_version, status, attempts, dead_letter, updated_at, created_at, payload_json) VALUES (?, ?, ?, ?, 'processing', 1, 0, ?, ?, ?) " +
        "ON CONFLICT (message_id) DO UPDATE SET status = 'processing', attempts = queue_message_log.attempts + 1, updated_at = excluded.updated_at " +
        "WHERE queue_message_log.status NOT IN ('completed', 'dead-lettered') RETURNING status",
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
    .first<LogRow>();
  if (claimed) {
    return "claimed";
  }

  // Nothing was written: the row exists and is completed or dead-lettered.
  const row = await db
    .prepare("SELECT status FROM queue_message_log WHERE message_id = ?")
    .bind(envelope.MessageId)
    .first<LogRow>();
  return row?.status === "dead-lettered" ? "dead-lettered" : "duplicate";
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
