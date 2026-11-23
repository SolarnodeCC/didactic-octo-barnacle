import { type PriceTable } from "@roi/models";
import { REFERENCE_EMBEDDING } from "@roi/vector-store";

import { type AlertEvent } from "../alerts/types.js";
import { type ProcessingConfig } from "../processing-config.js";
import { type BudgetStop, type ModelBudget } from "../store/model-usage.js";
import { type SqlDatabase } from "../store/sql.js";
import { estimatedCosts, formulaDailyLimit } from "./daily-budget.js";

/**
 * The one `budget-stop` alert of a day (REQ-NFR-005 AC2, REQ-NFR-019 AC1, ADR 0055). It holds
 * the day, the amounts, and fixed sentences only.
 */
export function budgetStopAlert(stop: BudgetStop): AlertEvent {
  const spent = stop.Spent.toFixed(4);
  const limit = stop.Limit.Amount.toFixed(4);
  const when = stop.StoppedAt ? ` at ${stop.StoppedAt}` : "";
  return {
    Type: "budget-stop",
    Source: "budget",
    Summary:
      `The model budget of ${stop.Day} is used up${when}: ${spent} of ${limit} ${stop.Limit.Currency} spent. ` +
      "Steps that started finish; new triage, extraction, and embedding steps wait as budget-deferred and the next admission run queues them again. " +
      "Check the cost per opportunity in AI Gateway before raising the budget (ADR 0023).",
  };
}

/**
 * The budget of an environment: the ADR 0059 formula over its expected volumes, with each
 * step's measured cost once there is one and the estimate before (REQ-NFR-005 AC1). Throws
 * when a configured model has no price, so the Worker never runs on a guessed budget.
 */
export function environmentBudget(options: {
  Db: SqlDatabase;
  Processing: ProcessingConfig;
  Prices: PriceTable;
  OnStop: (stop: BudgetStop) => Promise<void>;
  Log?: (event: string, fields: Record<string, unknown>) => void;
}): ModelBudget {
  const processing = options.Processing;
  const estimated = estimatedCosts(
    processing.BudgetEstimate,
    options.Prices,
    {
      triage: processing.TriageModel.Model,
      extraction: processing.ExtractionModel.Model,
      embedding: REFERENCE_EMBEDDING.Model,
    },
    processing.FullTextMaxChars,
  );
  return {
    Limit: formulaDailyLimit({
      Db: options.Db,
      Inputs: {
        ExpectedDailyTriaged: processing.ExpectedDailyTriaged,
        DailyExtractionLimit: processing.DailyExtractionLimit,
        ExpectedDailyEmbeddings: processing.ExpectedDailyEmbeddings,
        Multiplier: processing.BudgetMultiplier,
      },
      Estimated: estimated,
      Window: { Days: processing.BudgetMeasuredDays, MinItems: processing.BudgetMeasuredMinItems },
      ...(options.Log ? { Log: options.Log } : {}),
    }),
    OnStop: options.OnStop,
    Now: () => new Date().toISOString(),
  };
}
