import { z } from "zod";

import { IsoDateTimeSchema } from "./common.js";
import { MoneySchema } from "./money.js";

/**
 * The usage record of one model or search call attempt (REQ-NFR-011,
 * docs/kt/phase-2/schema.md `model_call`). It holds IDs, counts, and cost only, never
 * prompt or publication text, so the schema is strict.
 */

export const ModelCallOutcomeSchema = z.enum(["ok", "invalid-output", "provider-error"]);
export type ModelCallOutcome = z.infer<typeof ModelCallOutcomeSchema>;

/** Which run table `RunId` points into: `processing_run` or `pipeline_run`. */
export const ModelCallRunKindSchema = z.enum(["processing", "pipeline"]);
export type ModelCallRunKind = z.infer<typeof ModelCallRunKindSchema>;

export const ModelCallKindSchema = z.enum(["model", "search"]);
export type ModelCallKind = z.infer<typeof ModelCallKindSchema>;

const NonNegativeInt = z.number().int().nonnegative();

export const ModelCallRecordSchema = z
  .object({
    Id: z.string().min(1),
    RunKind: ModelCallRunKindSchema,
    RunId: z.string().min(1),
    StepName: z.string().min(1).max(64),
    Agent: z.string().min(1).max(64).nullable(),
    PublicationId: z.string().min(1).nullable(),
    CandidateId: z.string().min(1).nullable(),
    Model: z.string().min(1).max(200),
    PromptVersion: z.string().min(1).max(64).nullable(),
    Attempt: z.number().int().min(1),
    InputTokens: NonNegativeInt,
    OutputTokens: NonNegativeInt,
    LatencyMs: NonNegativeInt,
    Cost: MoneySchema.refine((money) => money.Amount >= 0, "cost is not negative"),
    PriceTableVersion: z.string().min(1).nullable(),
    Estimated: z.boolean(),
    Outcome: ModelCallOutcomeSchema,
    GatewayRequestId: z.string().min(1).nullable(),
    CallKind: ModelCallKindSchema,
    SearchQuery: z.string().min(1).max(400).nullable(),
    SearchResultCount: NonNegativeInt.nullable(),
    CreatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.Estimated && record.PriceTableVersion === null) {
      ctx.addIssue({
        code: "custom",
        path: ["PriceTableVersion"],
        message: "an estimated cost names the price table version (REQ-NFR-011 AC2)",
      });
    }
    const isSearch = record.CallKind === "search";
    if (isSearch !== (record.SearchQuery !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["SearchQuery"],
        message: "a search call has a query and a model call has none",
      });
    }
    if (isSearch !== (record.SearchResultCount !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["SearchResultCount"],
        message: "a search call has a result count and a model call has none",
      });
    }
  });

export type ModelCallRecord = z.infer<typeof ModelCallRecordSchema>;
