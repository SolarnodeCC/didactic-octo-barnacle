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
import { reportProcessingRuns } from "../report/processing-report.js";
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
    await runAdmissionCron(deps, deps.Now().slice(0, 10));
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
 * The daily admission cron (ADR 0055, ADR 0063, ADR 0126). Yesterday's daily run is reported
 * first (REQ-NFR-005 AC3), retracted publications are swept (REQ-DATA-008), failed steps are
 * re-driven, then the day's admission runs and extraction is queued for the admitted.
 *
 * Each step runs on its own: a step that throws is logged and raises a `failed-run` alert, and
 * the later steps still run, so one failing step does not hold back the day's admission. Only
 * queueing the admitted extractions depends on the admission. The first error is thrown again
 * at the end, so the cron invocation still shows as failed.
 */
export async function runAdmissionCron(deps: PipelineDeps, day: string): Promise<void> {
  const errors: unknown[] = [];
  const step = async <T>(name: string, work: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await work();
    } catch (error) {
      errors.push(error);
      const message = error instanceof Error ? error.message : "unknown error";
      deps.Log?.("cron.step_failed", { cron: ADMISSION_CRON, step: name, day, error: message });
      await notify(deps, {
        Type: "failed-run",
        Source: `admission:${name}`,
        Summary: `The admission step ${name} failed on ${day}: ${message}`,
      });
      return undefined;
    }
  };

  await step("report", () => reportProcessingRuns(deps, day));
  await step("retraction-sweep", () => sweepRetractions(deps, day));
  await step("redrive-triage", () => redriveTriage(deps, day));
  // Re-driven extractions count toward the day's limit, so they go before the admission
  // (REQ-PROC-010 AC3).
  const redriven = await step("redrive-extraction", () => redriveExtraction(deps, day));
  await step("redrive-embedding", () => redriveEmbedding(deps, day));
  const admitted = await step("admission", () => admitDay(deps, day));
  if (admitted !== undefined) {
    // Admitted extractions are paced after the re-driven ones (ADR 0118).
    await step("queue-extractions", () =>
      queueAdmittedExtractions(
        deps,
        day,
        redriven?.Outcome === "redriven" ? redriven.Counts.Redriven : 0,
      ),
    );
  }
  // A new embedding index fills a little more each day until its backfill is done (ADR 0056).
  await step("embedding-backfill", () => continueEmbeddingBackfills(deps, day));

  if (errors.length > 0) {
    throw errors[0];
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
