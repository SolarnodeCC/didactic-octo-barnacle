import { addRunFailures } from "./redrive-repo.js";
import { type PipelineDeps } from "../queue/deps.js";
import { replayDeadLetter } from "../queue/replay.js";
import { dailyRunId } from "../store/processing-run-repo.js";

/** Automatic replays per message ID (REQ-DATA-012 AC1). */
export const MAX_AUTOMATIC_REPLAYS = 2;

export type ReplayCounts = { Replayed: number; ReplayFailed: number; Exhausted: number };

/**
 * Replays dead-lettered messages without a person (REQ-DATA-012, ADR 0063): each one
 * `recovery.dead_letter_replay_hours` after it went to the dead-letter queue, at most twice per
 * message ID, through the replay function of REQ-DATA-011 AC4, so a replay creates no
 * duplicates and a replayed page can reopen and finish its run. A message still dead-lettered
 * after its second replay stays there and is listed in the day's processing run report; the
 * `dead-letter` alert is still sent for every dead letter by the dead-letter consumer.
 */
export async function replayDueDeadLetters(deps: PipelineDeps): Promise<ReplayCounts> {
  const counts: ReplayCounts = { Replayed: 0, ReplayFailed: 0, Exhausted: 0 };
  const recovery = deps.Recovery;
  if (!recovery) {
    return counts;
  }
  const now = deps.Now();
  const due = new Date(
    Date.parse(now) - recovery.DeadLetterReplayHours * 3600 * 1000,
  ).toISOString();
  const { results } = await deps.Db.prepare(
    `SELECT message_id FROM queue_message_log
     WHERE status = 'dead-lettered' AND replay_count < ? AND dead_lettered_at IS NOT NULL
       AND dead_lettered_at <= ?
     ORDER BY dead_lettered_at, message_id`,
  )
    .bind(MAX_AUTOMATIC_REPLAYS, due)
    .all<{ message_id: string }>();

  for (const { message_id: messageId } of results) {
    try {
      if ((await replayDeadLetter(deps, messageId)) === "replayed") {
        await deps.Db.prepare(
          "UPDATE queue_message_log SET replay_count = replay_count + 1 WHERE message_id = ?",
        )
          .bind(messageId)
          .run();
        counts.Replayed += 1;
      }
    } catch (error) {
      // The message stays dead-lettered and is tried again by the next check.
      counts.ReplayFailed += 1;
      deps.Log?.("dead_letter.replay_failed", {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { results: exhausted } = await deps.Db.prepare(
    "SELECT message_id, type FROM queue_message_log WHERE status = 'dead-lettered' AND replay_count >= ?",
  )
    .bind(MAX_AUTOMATIC_REPLAYS)
    .all<{ message_id: string; type: string }>();
  counts.Exhausted = exhausted.length;
  if (exhausted.length > 0) {
    const runId = await dailyRunId(deps.Db, now.slice(0, 10), now, deps.NewId);
    await addRunFailures(
      deps.Db,
      runId,
      exhausted.map((row) => ({
        PublicationId: null,
        Reason: `${row.type} message ${row.message_id} still dead-lettered after ${MAX_AUTOMATIC_REPLAYS} automatic replays`,
      })),
    );
  }
  deps.Log?.("dead_letter.replay_check", { ...counts });
  return counts;
}
