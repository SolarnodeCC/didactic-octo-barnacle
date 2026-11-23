import { extractEnvelope, type PipelineDeps } from "../queue/deps.js";
import { SEND_BATCH_LIMIT } from "../queue/types.js";

/** Publications queued per run; the daily limit keeps the real number far below it. */
export const MAX_EXTRACTIONS_QUEUED_PER_RUN = 1_000;

/**
 * Queues `publication.extract` for every admitted publication without an extraction result whose
 * message has not been seen yet (ADR 0055): those the admission just accepted, and any whose
 * message was lost, for example in a stop between the admission's commit and the send, or while
 * processing was off. It runs after the admission and sends nothing while the day's budget is
 * used up (REQ-NFR-005 AC2). Message IDs are fixed, so a publication queued twice is one
 * extraction (REQ-PROC-010 AC7).
 */
export async function queueAdmittedExtractions(deps: PipelineDeps, day: string): Promise<number> {
  const extraction = deps.Extraction;
  if (!extraction?.Queue) {
    return 0;
  }
  if (!(await extraction.Call.Usage.budgetAllows(day))) {
    deps.Log?.("extraction.queue_budget_stopped", { day });
    return 0;
  }
  const { results } = await deps.Db.prepare(
    `SELECT td.publication_id FROM triage_decision td
     WHERE td.accepted = 1
       AND NOT EXISTS (SELECT 1 FROM extraction_result er WHERE er.publication_id = td.publication_id)
       AND NOT EXISTS (
         SELECT 1 FROM queue_message_log q WHERE q.message_id = 'extract:' || td.publication_id
       )
     ORDER BY td.admitted_on, td.publication_id
     LIMIT ?`,
  )
    .bind(MAX_EXTRACTIONS_QUEUED_PER_RUN)
    .all<{ publication_id: string }>();
  const ids = results.map((row) => row.publication_id);
  for (let start = 0; start < ids.length; start += SEND_BATCH_LIMIT) {
    await extraction.Queue.sendBatch(
      ids
        .slice(start, start + SEND_BATCH_LIMIT)
        .map((publicationId) => ({ body: extractEnvelope(publicationId) })),
    );
  }
  deps.Log?.("extraction.queued", { day, count: ids.length });
  return ids.length;
}
