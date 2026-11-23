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

/** One quality rate of the day against its baseline (ADR 0071, REQ-NFR-023 AC3). */
export const QualityMetricSchema = z
  .object({
    Metric: z.string().min(1),
    Value: z.number().nonnegative().finite(),
    /** The items the rate is computed over. */
    Items: z.number().int().nonnegative(),
    /** Median of the previous `monitor.baseline_days`; null without earlier values. */
    Baseline: z.number().nonnegative().finite().nullable(),
    Drift: z.boolean(),
  })
  .strict();
export type QualityMetric = z.infer<typeof QualityMetricSchema>;

const Tenths = z.array(z.number().int().nonnegative()).length(10);

/**
 * The quality section of a daily processing run report (REQ-NFR-023, ADR 0071), computed from
 * stored rows without a model call. It holds counts and rates only, never text (AC5).
 */
export const QualitySectionSchema = z
  .object({
    Metrics: z.array(QualityMetricSchema),
    /** Extraction `Confidence` per tenth, 0.0-0.1 first. */
    ConfidenceHistogram: Tenths,
    /** Kept quotes by where they start in the input, per tenth of its length. */
    QuotePositions: Tenths,
    /** Extracted publications per industry of the topic map. */
    Industries: z.record(z.string().min(1), z.number().int().nonnegative()),
    /** Pairs of candidates that are possible near-duplicates; null without a vector index. */
    NearDuplicates: z.number().int().nonnegative().nullable(),
    /** True during the first `monitor.baseline_days` after processing starts (AC4). */
    StartUp: z.boolean(),
  })
  .strict();
export type QualitySection = z.infer<typeof QualitySectionSchema>;

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
    /** The quality section of a `daily` run; null for other runs. */
    Quality: QualitySectionSchema.nullable(),
  })
  .strict();
export type ProcessingReport = z.infer<typeof ProcessingReportSchema>;
