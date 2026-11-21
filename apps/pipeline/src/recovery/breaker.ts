import { notify } from "../alerts/notify.js";
import { type PipelineDeps } from "../queue/deps.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlDatabase } from "../store/sql.js";
import { runTriageStep } from "../triage/step.js";

/** One probe call every 30 minutes while a step is paused (ADR 0063). */
export const PROBE_INTERVAL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A fixed, harmless input for the probe: no stored publication, no publication text. */
const PROBE_INPUT = {
  Title: "Probe of the triage step",
  Abstract:
    "Hospital planners lose theatre time to late cancellations and rebuild the schedule by hand each morning.",
};

/** True while the step is paused by the breaker (REQ-PROC-010 AC6). */
export async function isPaused(db: SqlDatabase, step: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS paused FROM step_pause WHERE step = ? AND resumed_at IS NULL")
    .bind(step)
    .first<{ paused: number }>();
  return row !== null;
}

/**
 * Pauses the step when more than `recovery.breaker_failure_share` of its calls in the last hour
 * ended in `provider-error`, judged once the hour holds at least `recovery.breaker_min_calls`
 * calls. A new pause sends one `step-paused` alert; a step already paused stays as it is.
 * Called after a call that ended in a provider error. Returns true when the step is paused.
 */
export async function checkBreaker(deps: PipelineDeps, step: string): Promise<boolean> {
  const recovery = deps.Recovery;
  if (!recovery) {
    return false;
  }
  if (await isPaused(deps.Db, step)) {
    return true;
  }
  const now = deps.Now();
  const since = new Date(Date.parse(now) - HOUR_MS).toISOString();
  const calls = await deps.Db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(outcome = 'provider-error'), 0) AS failed
     FROM model_call WHERE step_name = ? AND created_at >= ?`,
  )
    .bind(step, since)
    .first<{ total: number; failed: number }>();
  const total = calls?.total ?? 0;
  const failed = calls?.failed ?? 0;
  if (total < recovery.BreakerMinCalls || failed / total <= recovery.BreakerFailureShare) {
    return false;
  }
  await deps.Db.prepare(
    `INSERT INTO step_pause (step, paused_at, last_probe_at, resumed_at, alerted_at)
     VALUES (?, ?, NULL, NULL, ?)
     ON CONFLICT (step) DO UPDATE SET paused_at = excluded.paused_at, last_probe_at = NULL,
       resumed_at = NULL, alerted_at = excluded.alerted_at`,
  )
    .bind(step, now, now)
    .run();
  deps.Log?.("breaker.paused", { step, total, failed });
  await notify(deps, {
    Type: "step-paused",
    Source: step,
    Summary: `The ${step} step is paused: ${failed} of its ${total} model calls in the last hour ended in a provider error. New items wait as budget-deferred, and a probe every 30 minutes resumes the step when it succeeds.`,
  });
  return true;
}

export type ProbeOutcome = "not-paused" | "not-due" | "resumed" | "still-failing";

/**
 * The probe of a paused step: at most one call every 30 minutes; a call that succeeds resumes
 * the step (REQ-PROC-010 AC6). Only the triage step has a model in WP6.
 */
export async function probeTriage(deps: PipelineDeps): Promise<ProbeOutcome> {
  const step = "triage";
  const triage = deps.Triage;
  const row = await deps.Db.prepare(
    "SELECT last_probe_at, paused_at FROM step_pause WHERE step = ? AND resumed_at IS NULL",
  )
    .bind(step)
    .first<{ last_probe_at: string | null; paused_at: string }>();
  if (!row || !triage) {
    return "not-paused";
  }
  const now = deps.Now();
  const last = Date.parse(row.last_probe_at ?? row.paused_at);
  if (Date.parse(now) - last < PROBE_INTERVAL_MS) {
    return "not-due";
  }
  await deps.Db.prepare("UPDATE step_pause SET last_probe_at = ? WHERE step = ?")
    .bind(now, step)
    .run();
  const runId = await dailyRunId(deps.Db, now.slice(0, 10), now, deps.NewId);
  const result = await runTriageStep(triage.Call, triage.Model, {
    RunId: runId,
    PublicationId: null,
    ...PROBE_INPUT,
  });
  if (!result.Ok) {
    deps.Log?.("breaker.probe_failed", { step, reason: result.Reason });
    return "still-failing";
  }
  await deps.Db.prepare("UPDATE step_pause SET resumed_at = ? WHERE step = ?")
    .bind(now, step)
    .run();
  deps.Log?.("breaker.resumed", { step });
  return "resumed";
}
