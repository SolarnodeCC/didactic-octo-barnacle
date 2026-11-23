import { ADMISSION_CRON, CRON_SOURCES, RECOVERY_CRON, RETRACTION_CRON } from "../config.js";
import { probeStep } from "../recovery/breaker.js";
import { replayDueDeadLetters } from "../recovery/dead-letters.js";
import { redriveEmbedding, redriveExtraction, redriveTriage } from "../recovery/redrive.js";
import { admitDay } from "../triage/admission.js";
import { startRetractionCheck } from "../retraction/check.js";
import { sweepRetractions } from "../retraction/sweep.js";
import { queueAdmittedExtractions } from "../extraction/queue-extractions.js";
import { continueEmbeddingBackfills } from "../embedding/backfill.js";
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
    // Retracted publications are swept first, then failed steps are re-driven, then the day's
    // admission, then extraction is queued for the admitted (REQ-DATA-008, ADR 0063, ADR 0055).
    const day = deps.Now().slice(0, 10);
    await sweepRetractions(deps, day);
    await redriveTriage(deps, day);
    // Re-driven extractions count toward the day's limit, so they go before the admission
    // (REQ-PROC-010 AC3).
    await redriveExtraction(deps, day);
    await redriveEmbedding(deps, day);
    await admitDay(deps, day);
    await queueAdmittedExtractions(deps, day);
    // A new embedding index fills a little more each day until its backfill is done (ADR 0056).
    await continueEmbeddingBackfills(deps, day);
    return null;
  }
  if (cron === RETRACTION_CRON) {
    // The weekly retraction check; the next admission sweep handles what it flags (REQ-DATA-008).
    await startRetractionCheck(deps, deps.Now().slice(0, 10));
    return null;
  }
  if (cron === RECOVERY_CRON) {
    // Dead-letter replay and the breaker probe (REQ-DATA-012, REQ-PROC-010 AC6).
    await replayDueDeadLetters(deps);
    await probeStep(deps, "triage");
    await probeStep(deps, "extraction");
    await probeStep(deps, "embedding");
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
