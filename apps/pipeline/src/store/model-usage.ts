import { type ModelCallRecord, type ModelUsageStore, type Money } from "@roi/models";

import { type SqlDatabase } from "./sql.js";

/**
 * D1 store for `callModel` (REQ-NFR-005, REQ-NFR-011, ADR 0054): one `model_call` row per
 * attempt, with its cost added to `budget_day` in the same batch.
 */
export function createModelUsageStore(db: SqlDatabase, dailyLimit: Money): ModelUsageStore {
  return {
    async budgetAllows(day: string): Promise<boolean> {
      const row = await db
        .prepare("SELECT spent_amount, limit_amount FROM budget_day WHERE day = ?")
        .bind(day)
        .first<{ spent_amount: number; limit_amount: number }>();
      if (row === null) {
        return dailyLimit.Amount > 0;
      }
      return row.spent_amount < row.limit_amount;
    },

    async record(record: ModelCallRecord): Promise<void> {
      if (record.Cost.Currency !== dailyLimit.Currency) {
        throw new Error(
          `cost in ${record.Cost.Currency} cannot be added to a budget in ${dailyLimit.Currency}`,
        );
      }
      const day = record.CreatedAt.slice(0, 10);
      await db.batch([
        db
          .prepare(
            `INSERT INTO model_call (
              id, run_kind, run_id, step_name, agent, publication_id, candidate_id, model,
              prompt_version, attempt, input_tokens, output_tokens, latency_ms, cost_amount,
              cost_currency, price_table_version, estimated, outcome, gateway_request_id,
              call_kind, search_query, search_result_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          .bind(day, dailyLimit.Amount, record.Cost.Amount, dailyLimit.Currency),
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
  OutputTokens: number;
  CostAmount: number;
};

export async function usageTotalsForDay(db: SqlDatabase, day: string): Promise<UsageTotal[]> {
  const { results } = await db
    .prepare(
      `SELECT step_name, agent, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
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
      output_tokens: number;
      cost_amount: number;
    }>();
  return results.map((row) => ({
    StepName: row.step_name,
    Agent: row.agent,
    Calls: row.calls,
    InputTokens: row.input_tokens,
    OutputTokens: row.output_tokens,
    CostAmount: row.cost_amount,
  }));
}
