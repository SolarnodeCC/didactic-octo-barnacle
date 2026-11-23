import { type ModelCallRecord, type ModelUsageStore, type Money } from "@roi/models";

import { type DailyLimit } from "../budget/daily-budget.js";
import { type SqlDatabase } from "./sql.js";

/** The day's budget stop, as the `budget-stop` alert reports it (REQ-NFR-005 AC2). */
export type BudgetStop = {
  Day: string;
  Limit: Money;
  Spent: number;
  /** When the spend reached the limit; null when the day began with no budget at all. */
  StoppedAt: string | null;
};

export type ModelBudget = {
  /** The day's limit: fixed, or computed the first time the day is seen (ADR 0059). */
  Limit: Money | DailyLimit;
  /** Called once per day, by the first refusal after the limit is reached (ADR 0055). */
  OnStop?: (stop: BudgetStop) => Promise<void>;
  /** The time of a refusal, for `alerted_at`. */
  Now?: () => string;
};

type BudgetRow = {
  limit_amount: number;
  spent_amount: number;
  currency: string;
  stopped_at: string | null;
};

/**
 * D1 store for `callModel` (REQ-NFR-005, REQ-NFR-011, ADR 0054): one `model_call` row per
 * attempt, with its cost added to `budget_day` in the same batch.
 *
 * The first use of a day writes its `budget_day` row with the day's limit. A record that brings
 * the spend to the limit sets `stopped_at`; the first refusal after that sets `alerted_at` and
 * calls `OnStop`, so the day has one `budget-stop` alert however many steps are refused.
 */
export function createModelUsageStore(
  db: SqlDatabase,
  budget: Money | ModelBudget,
): ModelUsageStore {
  const options: ModelBudget = "Amount" in budget ? { Limit: budget } : budget;
  const currency = typeof options.Limit === "function" ? "EUR" : options.Limit.Currency;
  const limits = new Map<string, Promise<Money>>();
  const now = options.Now ?? (() => new Date().toISOString());

  const read = (day: string) =>
    db
      .prepare(
        "SELECT limit_amount, spent_amount, currency, stopped_at FROM budget_day WHERE day = ?",
      )
      .bind(day)
      .first<BudgetRow>();

  /** The day's limit: the stored one when the row exists, otherwise computed once. */
  const limitFor = (day: string, absent = false): Promise<Money> => {
    let limit = limits.get(day);
    if (limit === undefined) {
      limit = (async () => {
        const row = absent ? null : await read(day);
        if (row !== null) {
          return { Amount: row.limit_amount, Currency: row.currency };
        }
        return typeof options.Limit === "function" ? options.Limit(day) : options.Limit;
      })();
      limit.catch(() => limits.delete(day));
      limits.set(day, limit);
    }
    return limit;
  };

  return {
    async budgetAllows(day: string): Promise<boolean> {
      let row = await read(day);
      if (row === null) {
        const limit = await limitFor(day, true);
        // Another isolate may have written the row meanwhile; the stored one wins.
        row = await db
          .prepare(
            `INSERT INTO budget_day (day, limit_amount, spent_amount, currency)
             VALUES (?, ?, 0, ?) ON CONFLICT (day) DO UPDATE SET day = excluded.day
             RETURNING limit_amount, spent_amount, currency, stopped_at`,
          )
          .bind(day, limit.Amount, limit.Currency)
          .first<BudgetRow>();
      }
      if (row !== null) {
        limits.set(day, Promise.resolve({ Amount: row.limit_amount, Currency: row.currency }));
        if (row.spent_amount < row.limit_amount) {
          return true;
        }
      }
      // Refused: the first refusal of the day marks the alert, so only one is sent (ADR 0055).
      const stopped = await db
        .prepare(
          `UPDATE budget_day SET alerted_at = ? WHERE day = ? AND alerted_at IS NULL
           RETURNING limit_amount, spent_amount, currency, stopped_at`,
        )
        .bind(now(), day)
        .first<BudgetRow>();
      if (stopped !== null && options.OnStop) {
        await options.OnStop({
          Day: day,
          Limit: { Amount: stopped.limit_amount, Currency: stopped.currency },
          Spent: stopped.spent_amount,
          StoppedAt: stopped.stopped_at,
        });
      }
      return false;
    },

    async record(record: ModelCallRecord): Promise<void> {
      if (record.Cost.Currency !== currency) {
        throw new Error(
          `cost in ${record.Cost.Currency} cannot be added to a budget in ${currency}`,
        );
      }
      const day = record.CreatedAt.slice(0, 10);
      const limit = await limitFor(day);
      await db.batch([
        db
          .prepare(
            `INSERT INTO model_call (
              id, run_kind, run_id, step_name, agent, publication_id, candidate_id, model,
              prompt_version, attempt, input_tokens, cached_input_tokens, output_tokens,
              latency_ms, cost_amount, cost_currency, price_table_version, estimated, outcome,
              gateway_request_id, call_kind, search_query, search_result_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            record.Id,
            record.RunKind,
            record.RunId,
            record.StepName,
            record.Agent,
            record.PublicationId,
            record.CandidateId,
            record.Model,
            record.PromptVersion,
            record.Attempt,
            record.InputTokens,
            record.CachedInputTokens,
            record.OutputTokens,
            record.LatencyMs,
            record.Cost.Amount,
            record.Cost.Currency,
            record.PriceTableVersion,
            record.Estimated ? 1 : 0,
            record.Outcome,
            record.GatewayRequestId,
            record.CallKind,
            record.SearchQuery,
            record.SearchResultCount,
            record.CreatedAt,
          ),
        db
          .prepare(
            `INSERT INTO budget_day (day, limit_amount, spent_amount, currency)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (day) DO UPDATE SET spent_amount = spent_amount + excluded.spent_amount`,
          )
          .bind(day, limit.Amount, record.Cost.Amount, limit.Currency),
        // The call that brings the spend to the limit stops the day (REQ-NFR-005 AC2).
        db
          .prepare(
            `UPDATE budget_day SET stopped_at = ?
             WHERE day = ? AND stopped_at IS NULL AND spent_amount >= limit_amount`,
          )
          .bind(record.CreatedAt, day),
      ]);
    },
  };
}

/** Totals of the records of one day, by step and agent (REQ-NFR-011 AC4). */
export type UsageTotal = {
  StepName: string;
  Agent: string | null;
  Calls: number;
  InputTokens: number;
  /** A part of `InputTokens`, billed at the cached-input price (ADR 0078). */
  CachedInputTokens: number;
  OutputTokens: number;
  CostAmount: number;
};

export async function usageTotalsForDay(db: SqlDatabase, day: string): Promise<UsageTotal[]> {
  const { results } = await db
    .prepare(
      `SELECT step_name, agent, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
              SUM(cached_input_tokens) AS cached_input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost_amount) AS cost_amount
       FROM model_call
       WHERE created_at >= ? AND created_at < ?
       GROUP BY step_name, agent
       ORDER BY step_name, agent`,
    )
    .bind(`${day}T00:00:00`, `${day}T99`)
    .all<{
      step_name: string;
      agent: string | null;
      calls: number;
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
      cost_amount: number;
    }>();
  return results.map((row) => ({
    StepName: row.step_name,
    Agent: row.agent,
    Calls: row.calls,
    InputTokens: row.input_tokens,
    CachedInputTokens: row.cached_input_tokens,
    OutputTokens: row.output_tokens,
    CostAmount: row.cost_amount,
  }));
}
