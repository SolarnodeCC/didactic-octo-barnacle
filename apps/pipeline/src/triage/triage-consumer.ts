import {
  QueueMessageEnvelopeSchema,
  TriageDecisionRowSchema,
  decideTriage,
  type TriageDecisionRow,
} from "@roi/models";

import { ruleReason } from "./rules.js";
import { runTriageStep } from "./step.js";
import { claimMessage, completeStatement, markFailed } from "../queue/log.js";
import { type PipelineDeps } from "../queue/deps.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlDatabase } from "../store/sql.js";

export type TriageOutcome =
  | "rule-rejected"
  | "low-score"
  | "awaiting-admission"
  | "already-triaged"
  | "no-publication"
  | "budget-deferred"
  | "model-failed"
  | "duplicate"
  | "dead-lettered";

type PublicationRow = {
  title: string;
  abstract: string | null;
  completeness: string;
  retracted: number;
  topics_json: string;
};

/**
 * Consumer of `publication.triage` (REQ-PROC-005, REQ-PROC-006, REQ-PROC-008). Rules decide
 * `incomplete`, `retracted`, and `out-of-scope` without a model call. Otherwise the model reads
 * the five signals and `decideTriage` scores them: below the cut the decision is `low-score`,
 * at or above it waits for the daily admission (ADR 0055). One decision per publication: a
 * repeated message, or one for a publication that already has a decision, changes nothing.
 *
 * A step refused by the budget, or failing all its attempts, completes the message with the
 * reason and writes no decision; the daily re-drive picks the publication up again (ADR 0063).
 */
export async function handleTriage(deps: PipelineDeps, body: unknown): Promise<TriageOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }
  try {
    const publicationId = envelope.Ids.PublicationId;
    if (envelope.Type !== "publication.triage" || publicationId === undefined) {
      throw new Error("publication.triage needs a PublicationId");
    }
    if (!deps.Triage) {
      throw new Error("triage is not configured in this Worker");
    }
    return await triage(deps, deps.Triage, envelope.MessageId, publicationId);
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("triage.failed", {
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function triage(
  deps: PipelineDeps,
  config: NonNullable<PipelineDeps["Triage"]>,
  messageId: string,
  publicationId: string,
): Promise<TriageOutcome> {
  const complete = (note: string | null) =>
    deps.Db.batch([completeStatement(deps.Db, messageId, deps.Now(), note)]);

  if (await hasDecision(deps.Db, publicationId)) {
    await complete("already triaged");
    return "already-triaged";
  }
  const publication = await deps.Db.prepare(
    "SELECT title, abstract, completeness, retracted, topics_json FROM publication WHERE id = ?",
  )
    .bind(publicationId)
    .first<PublicationRow>();
  if (!publication) {
    await complete("no such publication");
    return "no-publication";
  }

  const now = deps.Now();
  const runId = await dailyRunId(deps.Db, now.slice(0, 10), now, deps.NewId);
  const base = {
    Id: `tri_${deps.NewId()}`,
    PublicationId: publicationId,
    RunId: runId,
    Notes: null,
    AdmittedOn: null,
    CreatedAt: now,
    UpdatedAt: now,
  };

  const rule = ruleReason({
    Completeness: publication.completeness,
    Retracted: publication.retracted === 1,
    Topics: JSON.parse(publication.topics_json) as string[],
  });
  if (rule !== null) {
    await store(deps, messageId, {
      ...base,
      Status: "decided",
      Accepted: false,
      Score: null,
      Reason: rule,
      Signals: null,
      Model: null,
      PromptVersion: null,
    });
    deps.Log?.("triage.decided", { publicationId, reason: rule, model: false });
    return "rule-rejected";
  }

  const result = await runTriageStep(config.Call, config.Model, {
    RunId: runId,
    PublicationId: publicationId,
    Title: publication.title,
    Abstract: publication.abstract ?? "",
  });
  if (!result.Ok) {
    if (result.Reason === "budget-exhausted") {
      await complete("budget-deferred");
      deps.Log?.("triage.budget_deferred", { publicationId });
      return "budget-deferred";
    }
    await complete(`failed: ${result.Reason}: ${result.Errors.join("; ")}`);
    deps.Log?.("triage.model_failed", {
      publicationId,
      reason: result.Reason,
      attempts: result.Attempts,
    });
    return "model-failed";
  }

  const decision = decideTriage(result.Output.Signals, config.AcceptScoreCut);
  const passes = decision.Accepted;
  await store(deps, messageId, {
    ...base,
    Status: passes ? "awaiting-admission" : "decided",
    // Accepted is set by the daily admission, which also applies the daily limit (ADR 0055).
    Accepted: false,
    Score: decision.TriageScore,
    Reason: passes ? null : "low-score",
    Signals: result.Output.Signals,
    Notes: result.Output.Notes,
    Model: result.Model,
    PromptVersion: result.PromptVersion,
  });
  deps.Log?.("triage.decided", {
    publicationId,
    score: decision.TriageScore,
    passes,
    attempts: result.Attempts,
  });
  return passes ? "awaiting-admission" : "low-score";
}

async function hasDecision(db: SqlDatabase, publicationId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM triage_decision WHERE publication_id = ?")
    .bind(publicationId)
    .first<{ found: number }>();
  return row !== null;
}

const flag = (value: boolean | undefined): number | null =>
  value === undefined ? null : value ? 1 : 0;

/** Validates the row against the contract, then writes it with the message state. */
async function store(deps: PipelineDeps, messageId: string, row: TriageDecisionRow): Promise<void> {
  const decision = TriageDecisionRowSchema.parse(row);
  const signals = decision.Signals;
  await deps.Db.batch([
    deps.Db.prepare(
      `INSERT INTO triage_decision (
        id, publication_id, run_id, status, accepted, score, reason, signal_named_party,
        signal_stated_harm, signal_trigger, signal_existing_alternative, signal_adoptable,
        notes, model, prompt_version, admitted_on, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (publication_id) DO NOTHING`,
    ).bind(
      decision.Id,
      decision.PublicationId,
      decision.RunId,
      decision.Status,
      decision.Accepted ? 1 : 0,
      decision.Score,
      decision.Reason,
      flag(signals?.NamedParty),
      flag(signals?.StatedHarm),
      flag(signals?.Trigger),
      flag(signals?.ExistingAlternative),
      flag(signals?.Adoptable),
      decision.Notes,
      decision.Model,
      decision.PromptVersion,
      decision.AdmittedOn,
      decision.CreatedAt,
      decision.UpdatedAt,
    ),
    completeStatement(deps.Db, messageId, deps.Now()),
  ]);
}
