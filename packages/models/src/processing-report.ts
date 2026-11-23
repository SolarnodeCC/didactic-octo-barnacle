import { z } from "zod";

import { CurrencyCodeSchema } from "./money.js";
import { IsoDateSchema, IsoDateTimeSchema } from "./common.js";
import { IngestionRunStatusSchema } from "./ingestion-run.js";
import {
  ProcessingRunCountsSchema,
  ProcessingRunFailureSchema,
  ProcessingRunKindSchema,
} from "./processing.js";

const Amount = z.number().nonnegative().finite();

/** The model cost of one step within a run. */
export const ProcessingStepCostSchema = z
  .object({
    Step: z.string().min(1),
    /** Model calls, retries included. */
    Calls: z.number().int().nonnegative(),
    /** Distinct publications the calls served; null for a step that calls per batch. */
    Items: z.number().int().nonnegative().nullable(),
    Cost: Amount,
  })
  .strict();
export type ProcessingStepCost = z.infer<typeof ProcessingStepCostSchema>;

/**
 * The cost section of a processing run report (REQ-NFR-005 AC3, ADR 0114). `Total` is every
 * model call of the run, retries and embeddings included. A per-item figure is null when there
 * is nothing to divide by.
 */
export const ProcessingCostSchema = z
  .object({
    Currency: CurrencyCodeSchema,
    Total: Amount,
    ByStep: z.array(ProcessingStepCostSchema),
    /** Share of `Total` estimated from the price table instead of reported by the gateway. */
    EstimatedShare: z.number().min(0).max(1),
    Publications: z.number().int().nonnegative(),
    CostPerPublication: Amount.nullable(),
    /** Candidates written in the run; an opportunity is a candidate in phase 2 (ADR 0015). */
    Opportunities: z.number().int().nonnegative(),
    CostPerOpportunity: Amount.nullable(),
  })
  .strict();
export type ProcessingCost = z.infer<typeof ProcessingCostSchema>;

/** The budget of the run's day (REQ-NFR-005 AC2); null when the day made no model call. */
export const ProcessingBudgetSchema = z
  .object({
    Limit: Amount,
    Spent: Amount,
    StoppedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

/**
 * The report of one processing run (REQ-NFR-008 AC2, REQ-NFR-005 AC3): its counts, the items
 * marked `failed-final`, the day's budget, and the model cost. It holds IDs, counts, and
 * amounts, never publication text.
 */
export const ProcessingReportSchema = z
  .object({
    RunId: z.string().min(1),
    Kind: ProcessingRunKindSchema,
    Day: IsoDateSchema,
    Status: IngestionRunStatusSchema,
    StartedAt: IsoDateTimeSchema,
    EndedAt: IsoDateTimeSchema.nullable(),
    Counts: ProcessingRunCountsSchema,
    Failures: z.array(ProcessingRunFailureSchema),
    Budget: ProcessingBudgetSchema.nullable(),
    Cost: ProcessingCostSchema,
  })
  .strict();
export type ProcessingReport = z.infer<typeof ProcessingReportSchema>;
