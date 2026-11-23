import { ProcessingReportSchema, type ProcessingReport } from "@roi/models";

import { sanitizeReason } from "./sanitize.js";
import { type PipelineDeps } from "../queue/deps.js";
import { type SqlDatabase } from "../store/sql.js";

type RunRow = {
  id: string;
  kind: string;
  day: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  counts_json: string;
  failures_json: string;
};

/** Rounded to 1e-8, as costs are recorded (model-calls.md). */
function round(amount: number): number {
  return Math.round(amount * 1e8) / 1e8;
}

/** A per-item figure, or null when there is nothing to divide by. */
function per(total: number, items: number): number | null {
  return items > 0 ? round(total / items) : null;
}

/**
 * The report of one processing run (REQ-NFR-008 AC2, REQ-NFR-005 AC3, ADR 0114):
 * - `Total` is the cost of every `model_call` of the run, retries and embeddings included;
 * - the cost per publication divides it by the distinct publications with a call in the run;
 * - the cost per opportunity divides it by the candidates the run's extractions wrote.
 * Embedding calls serve a batch and carry no publication, so they add cost but no items.
 */
export async function buildProcessingReport(
  db: SqlDatabase,
  runId: string,
): Promise<ProcessingReport | null> {
  const run = await db
    .prepare(
      `SELECT id, kind, day, status, started_at, ended_at, counts_json, failures_json
       FROM processing_run WHERE id = ?`,
    )
    .bind(runId)
    .first<RunRow>();
  if (run === null) {
    return null;
  }

  const steps = await db
    .prepare(
      `SELECT step_name, COUNT(*) AS calls, COUNT(DISTINCT publication_id) AS items,
              COALESCE(SUM(cost_amount), 0) AS cost,
              COALESCE(SUM(CASE WHEN estimated = 1 THEN cost_amount ELSE 0 END), 0) AS estimated,
              MIN(cost_currency) AS currency
       FROM model_call WHERE run_kind = 'processing' AND run_id = ?
       GROUP BY step_name ORDER BY step_name`,
    )
    .bind(runId)
    .all<{
      step_name: string;
      calls: number;
      items: number;
      cost: number;
      estimated: number;
      currency: string;
    }>();
  const publications = await db
    .prepare(
      `SELECT COUNT(DISTINCT publication_id) AS n FROM model_call
       WHERE run_kind = 'processing' AND run_id = ? AND publication_id IS NOT NULL`,
    )
    .bind(runId)
    .first<{ n: number }>();
  const opportunities = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM candidate c
       JOIN extraction_result e ON e.id = c.extraction_result_id WHERE e.run_id = ?`,
    )
    .bind(runId)
    .first<{ n: number }>();
  const budget = await db
    .prepare("SELECT limit_amount, spent_amount, stopped_at FROM budget_day WHERE day = ?")
    .bind(run.day)
    .first<{ limit_amount: number; spent_amount: number; stopped_at: string | null }>();

  const total = round(steps.results.reduce((sum, row) => sum + row.cost, 0));
  const estimated = steps.results.reduce((sum, row) => sum + row.estimated, 0);
  const publicationCount = publications?.n ?? 0;
  const opportunityCount = opportunities?.n ?? 0;
  const failures = JSON.parse(run.failures_json) as Array<{
    PublicationId: string | null;
    Reason: string;
  }>;

  return ProcessingReportSchema.parse({
    RunId: run.id,
    Kind: run.kind,
    Day: run.day,
    Status: run.status,
    StartedAt: run.started_at,
    EndedAt: run.ended_at,
    Counts: JSON.parse(run.counts_json) as Record<string, number>,
    Failures: failures.map((failure) => ({
      PublicationId: failure.PublicationId,
      Reason: sanitizeReason(failure.Reason),
    })),
    Budget: budget
      ? {
          Limit: budget.limit_amount,
          Spent: round(budget.spent_amount),
          StoppedAt: budget.stopped_at,
        }
      : null,
    Cost: {
      Currency: steps.results[0]?.currency ?? "EUR",
      Total: total,
      ByStep: steps.results.map((row) => ({
        Step: row.step_name,
        Calls: row.calls,
        Items: row.items > 0 ? row.items : null,
        Cost: round(row.cost),
      })),
      EstimatedShare: total > 0 ? Math.min(1, round(estimated / total)) : 0,
      Publications: publicationCount,
      CostPerPublication: per(total, publicationCount),
      Opportunities: opportunityCount,
      CostPerOpportunity: per(total, opportunityCount),
    },
  });
}

/** Most runs reported per cron, so one invocation stays short. */
const REPORTS_PER_CRON = 20;

/**
 * Closes the `daily` processing runs of the days before `day` and writes the report of every
 * finished run that has none (REQ-NFR-008 AC2, REQ-NFR-005 AC3). A daily run with failed-final
 * items ends `partial`, otherwise `succeeded`. The admission cron calls it first, so each day
 * is reported the morning after. Running it again changes nothing.
 */
export async function reportProcessingRuns(deps: PipelineDeps, day: string): Promise<string[]> {
  const db = deps.Db;
  const now = deps.Now();
  await db
    .prepare(
      `UPDATE processing_run
       SET status = CASE WHEN failures_json = '[]' THEN 'succeeded' ELSE 'partial' END,
           ended_at = ?
       WHERE kind = 'daily' AND day < ? AND status = 'running'`,
    )
    .bind(now, day)
    .run();
  const { results } = await db
    .prepare(
      `SELECT id FROM processing_run
       WHERE status <> 'running' AND report_json IS NULL ORDER BY day, id LIMIT ?`,
    )
    .bind(REPORTS_PER_CRON)
    .all<{ id: string }>();
  const reported: string[] = [];
  for (const { id } of results) {
    const report = await buildProcessingReport(db, id);
    if (report === null) {
      continue;
    }
    await db
      .prepare("UPDATE processing_run SET report_json = ? WHERE id = ? AND report_json IS NULL")
      .bind(JSON.stringify(report), id)
      .run();
    deps.Log?.("processing.report", {
      runId: id,
      kind: report.Kind,
      day: report.Day,
      status: report.Status,
      failures: report.Failures.length,
      cost: report.Cost.Total,
      costPerPublication: report.Cost.CostPerPublication,
      costPerOpportunity: report.Cost.CostPerOpportunity,
      budgetStoppedAt: report.Budget?.StoppedAt ?? null,
    });
    reported.push(id);
  }
  return reported;
}

/** The stored report of a run, or null while it has none. */
export async function storedProcessingReport(
  db: SqlDatabase,
  runId: string,
): Promise<ProcessingReport | null> {
  const row = await db
    .prepare("SELECT report_json FROM processing_run WHERE id = ?")
    .bind(runId)
    .first<{ report_json: string | null }>();
  return row?.report_json ? ProcessingReportSchema.parse(JSON.parse(row.report_json)) : null;
}
