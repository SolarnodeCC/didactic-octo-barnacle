import { ADMISSION_CRON, CRON_SOURCES } from "../config.js";
import { admitDay } from "../triage/admission.js";
import { notify } from "../alerts/notify.js";
import { textExtractEnvelope, type PipelineDeps } from "../queue/deps.js";
import { documentsAwaitingText } from "../store/document-repo.js";
import { SEND_BATCH_LIMIT } from "../queue/types.js";
import { startRun, StartRunError, type StartRunResult } from "./start-run.js";

/** Handles a cron trigger; an unknown cron expression starts nothing. */
export async function runScheduled(
  deps: PipelineDeps,
  cron: string,
): Promise<StartRunResult | null> {
  if (cron === ADMISSION_CRON) {
    // The admission of the UTC day of the trigger (REQ-PROC-005 AC2, ADR 0055).
    await admitDay(deps, deps.Now().slice(0, 10));
    return null;
  }
  const source = CRON_SOURCES[cron];
  if (!source) {
    deps.Log?.("cron.unknown", { cron });
    return null;
  }
  await queueTextBackfill(deps);
  try {
    return await startRun(deps, source);
  } catch (error) {
    // The run could not start: tell a person, then let the cron report the failure too.
    const runId = error instanceof StartRunError ? error.RunId : undefined;
    deps.Log?.("run.start_failed", { source, runId });
    await notify(deps, {
      Type: "failed-run",
      Source: source,
      ...(runId ? { RunId: runId } : {}),
      Summary: `The scheduled start failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    throw error;
  }
}

/**
 * Queues text extraction for stored PDFs that have no text yet: those stored before text
 * extraction was turned on, and any whose message was lost. At most
 * `text.backfill_per_run` per start; message IDs are fixed, so a document queued twice is
 * one message (REQ-DATA-006). It never stops the ingestion run: a failure is logged.
 */
export async function queueTextBackfill(deps: PipelineDeps): Promise<number> {
  const text = deps.Text;
  if (!text?.Queue || text.Limits.BackfillPerRun <= 0) {
    return 0;
  }
  try {
    const documents = await documentsAwaitingText(deps.Db, text.Limits.BackfillPerRun);
    for (let start = 0; start < documents.length; start += SEND_BATCH_LIMIT) {
      await text.Queue.sendBatch(
        documents
          .slice(start, start + SEND_BATCH_LIMIT)
          .map((document) => ({ body: textExtractEnvelope(document.publication_id, document.id) })),
      );
    }
    if (documents.length > 0) {
      deps.Log?.("text.backfill_queued", { documents: documents.length });
    }
    return documents.length;
  } catch (error) {
    deps.Log?.("text.backfill_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
