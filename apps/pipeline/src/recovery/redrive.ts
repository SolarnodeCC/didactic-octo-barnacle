import { type ModelConfig, type ModelUsageStore, type QueueMessageEnvelope } from "@roi/models";

import { isPaused } from "./breaker.js";
import { addRunCounts, addRunFailures } from "./redrive-repo.js";
import {
  embedEnvelope,
  extractEnvelope,
  triageEnvelope,
  type PipelineDeps,
} from "../queue/deps.js";
import { registryIndexes } from "../store/embedding-index-repo.js";
import { type QueueSender } from "../queue/types.js";
import { dailyRunId } from "../store/processing-run-repo.js";

export type RedriveCounts = {
  /** Items sent to their step again today. */
  Redriven: number;
  /** Items whose re-drives are used up: `failed-final`, listed in the run report. */
  FailedFinal: number;
  /** Content failures waiting for a new model or prompt version. */
  WaitingForChange: number;
  /** Items left for tomorrow because today's re-drive cap was reached. */
  OverDailyCap: number;
};

export type RedriveOutcome =
  | { Outcome: "redriven"; Counts: RedriveCounts }
  | { Outcome: "not-configured" | "paused" | "budget-stopped" };

type RedriveRow = {
  id: string;
  item_id: string;
  failure_class: "transient" | "content";
  count: number;
  last_attempt_at: string | null;
  last_failed_at: string;
  last_model: string | null;
  last_prompt_version: string | null;
};

/** What differs between the steps that are re-driven; the algorithm is the same. */
type RedriveSpec = {
  Step: "triage" | "extraction" | "embedding";
  /** A row here for the publication ends its re-drives, so none can create a second (AC7). */
  ResultTable: "triage_decision" | "extraction_result" | "embedding";
  /** The step's message: its ID is fixed, so its log row is reopened before it is sent again. */
  Envelope: (publicationId: string) => QueueMessageEnvelope;
  /** The step's current model and prompt version, compared for content failures (AC2). */
  Model: Pick<ModelConfig, "Model" | "PromptVersion">;
  Queue: QueueSender;
  Usage: ModelUsageStore;
  /** Prefix of the run-report counts, so the steps do not add into the same keys. */
  CountPrefix: "" | "Extraction" | "Embedding";
};

/**
 * The daily re-drive of failed triage steps (REQ-PROC-010 AC1 to AC5, AC7; ADR 0063), run by
 * the admission cron before it admits. A publication whose triage ended without a decision is
 * sent to triage again:
 *
 * - a transient failure (`provider-error`, `budget-exhausted`, a paused step) at most once a
 *   day, up to `recovery.max_redrives` times;
 * - a content failure (`invalid-output`) once, the day after it failed, and again only when the
 *   triage model or prompt version has changed since its last attempt;
 * - at most `recovery.max_redrives_per_day` items a day, shared with the extraction re-drive.
 *
 * When the re-drives are used up the item is `failed-final`: it is listed in the run report and
 * no longer re-driven, with no alert per item. Nothing is re-driven while the step is paused or
 * the day's budget is used up, so waiting never uses up an item's re-drives. A publication that
 * has a decision is never re-driven, so a re-drive cannot create a second one. Dead letters are
 * replayed by `replayDueDeadLetters` instead (REQ-DATA-012).
 */
export async function redriveTriage(deps: PipelineDeps, day: string): Promise<RedriveOutcome> {
  const triage = deps.Triage;
  if (!triage?.Queue) {
    return { Outcome: "not-configured" };
  }
  return redriveStep(deps, day, {
    Step: "triage",
    ResultTable: "triage_decision",
    Envelope: triageEnvelope,
    Model: triage.Model,
    Queue: triage.Queue,
    Usage: triage.Call.Usage,
    CountPrefix: "",
  });
}

/**
 * The daily re-drive of failed extractions, by the same rules as triage (REQ-PROC-010 AC1 to
 * AC5, AC7). It runs after the triage re-drive and before the admission, which counts the
 * extractions re-driven that day toward `ingestion.daily_extraction_limit` (AC3). A publication
 * with an `extraction_result` is never re-driven. Its counts are prefixed `Extraction`.
 */
export async function redriveExtraction(deps: PipelineDeps, day: string): Promise<RedriveOutcome> {
  const extraction = deps.Extraction;
  if (!extraction?.Queue) {
    return { Outcome: "not-configured" };
  }
  return redriveStep(deps, day, {
    Step: "extraction",
    ResultTable: "extraction_result",
    Envelope: extractEnvelope,
    Model: extraction.Model,
    Queue: extraction.Queue,
    Usage: extraction.Call.Usage,
    CountPrefix: "Extraction",
  });
}

/**
 * The daily re-drive of failed embeddings, by the same rules (REQ-PROC-010, ADR 0063). A
 * publication with an `embedding` row is not re-driven; it is sent again to the current index of
 * the registry. Its counts are prefixed `Embedding`.
 */
export async function redriveEmbedding(deps: PipelineDeps, day: string): Promise<RedriveOutcome> {
  const embedding = deps.Embedding;
  if (!embedding?.Queue) {
    return { Outcome: "not-configured" };
  }
  const current = (await registryIndexes(deps.Db, embedding.Environment)).find((i) => i.Current);
  if (!current) {
    return { Outcome: "not-configured" };
  }
  return redriveStep(deps, day, {
    Step: "embedding",
    ResultTable: "embedding",
    Envelope: (publicationId) => embedEnvelope(publicationId, current.Id),
    Model: { Model: current.ModelName, PromptVersion: null },
    Queue: embedding.Queue,
    Usage: embedding.Call.Usage,
    CountPrefix: "Embedding",
  });
}

async function redriveStep(
  deps: PipelineDeps,
  day: string,
  spec: RedriveSpec,
): Promise<RedriveOutcome> {
  const recovery = deps.Recovery;
  if (!recovery) {
    return { Outcome: "not-configured" };
  }
  if (await isPaused(deps.Db, spec.Step)) {
    return { Outcome: "paused" };
  }
  if (!(await spec.Usage.budgetAllows(day))) {
    return { Outcome: "budget-stopped" };
  }

  const now = deps.Now();
  const counts: RedriveCounts = {
    Redriven: 0,
    FailedFinal: 0,
    WaitingForChange: 0,
    OverDailyCap: 0,
  };
  const failures: Array<{ PublicationId: string; Reason: string }> = [];
  // The cap is shared by every step: the count has no step filter.
  const done = await deps.Db.prepare(
    "SELECT COUNT(*) AS n FROM redrive WHERE substr(last_attempt_at, 1, 10) = ?",
  )
    .bind(day)
    .first<{ n: number }>();
  let room = Math.max(0, recovery.MaxRedrivesPerDay - (done?.n ?? 0));

  // `ResultTable` comes from the closed union of the spec, never from input.
  const { results } = await deps.Db.prepare(
    `SELECT r.id, r.item_id, r.failure_class, r.count, r.last_attempt_at, r.last_failed_at,
            r.last_model, r.last_prompt_version
     FROM redrive r
     WHERE r.item_kind = 'publication' AND r.step = ? AND r.final = 0
       AND NOT EXISTS (SELECT 1 FROM ${spec.ResultTable} x WHERE x.publication_id = r.item_id)
       -- A retracted publication goes no further (REQ-DATA-008).
       AND NOT EXISTS (SELECT 1 FROM publication p WHERE p.id = r.item_id AND p.retracted = 1)
     ORDER BY r.last_failed_at, r.id`,
  )
    .bind(spec.Step)
    .all<RedriveRow>();

  for (const row of results) {
    if (row.last_attempt_at !== null && row.last_attempt_at.slice(0, 10) === day) {
      continue; // At most once a day.
    }
    if (row.count >= recovery.MaxRedrives) {
      await deps.Db.prepare("UPDATE redrive SET final = 1, updated_at = ? WHERE id = ?")
        .bind(now, row.id)
        .run();
      counts.FailedFinal += 1;
      failures.push({
        PublicationId: row.item_id,
        Reason: `${spec.Step} failed-final after ${row.count} re-drives (${row.failure_class})`,
      });
      continue;
    }
    if (row.failure_class === "content") {
      const changed =
        row.last_model !== spec.Model.Model || row.last_prompt_version !== spec.Model.PromptVersion;
      const nextDay = row.last_failed_at.slice(0, 10) < day;
      // Once the day after it failed; after that only when the model or prompt changed.
      if (!nextDay || (row.count >= 1 && !changed)) {
        counts.WaitingForChange += row.count >= 1 && !changed ? 1 : 0;
        continue;
      }
    }
    if (room <= 0) {
      counts.OverDailyCap += 1;
      continue;
    }
    room -= 1;
    const envelope = spec.Envelope(row.item_id);
    // The message ID is fixed, so its log row is reopened before it is sent again.
    await deps.Db.batch([
      deps.Db.prepare(
        "UPDATE queue_message_log SET status = 'pending', attempts = 0, last_error = NULL, updated_at = ? WHERE message_id = ?",
      ).bind(now, envelope.MessageId),
      deps.Db.prepare(
        "UPDATE redrive SET count = count + 1, last_attempt_at = ?, updated_at = ? WHERE id = ?",
      ).bind(now, now, row.id),
    ]);
    await spec.Queue.send(envelope);
    counts.Redriven += 1;
  }

  const runId = await dailyRunId(deps.Db, day, now, deps.NewId);
  await addRunCounts(
    deps.Db,
    runId,
    Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [`${spec.CountPrefix}${key}`, value]),
    ),
  );
  await addRunFailures(deps.Db, runId, failures);
  deps.Log?.(spec.Step === "triage" ? "redrive.done" : `redrive.${spec.Step}.done`, {
    day,
    ...counts,
  });
  return { Outcome: "redriven", Counts: counts };
}
