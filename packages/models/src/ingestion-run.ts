import { z } from "zod";

import { IsoDateTimeSchema, SourceNameSchema } from "./common.js";

export const IngestionRunCountsSchema = z.object({
  Fetched: z.number().int().nonnegative(),
  Created: z.number().int().nonnegative(),
  Updated: z.number().int().nonnegative(),
  Skipped: z.number().int().nonnegative(),
  Failed: z.number().int().nonnegative(),
  DeadLettered: z.number().int().nonnegative(),
});

export type IngestionRunCounts = z.infer<typeof IngestionRunCountsSchema>;

export const IngestionRunFailureSchema = z.object({
  SourceId: z.string().min(1).nullable(),
  Reason: z.string().min(1),
});

export type IngestionRunFailure = z.infer<typeof IngestionRunFailureSchema>;

export const IngestionRunStatusSchema = z.enum(["running", "succeeded", "failed", "partial"]);

export type IngestionRunStatus = z.infer<typeof IngestionRunStatusSchema>;

export const IngestionRunSchema = z.object({
  Id: z.string().min(1),
  Source: SourceNameSchema,
  Cursor: z.string().nullable(),
  Status: IngestionRunStatusSchema,
  StartedAt: IsoDateTimeSchema,
  EndedAt: IsoDateTimeSchema.nullable(),
  Counts: IngestionRunCountsSchema,
  Failures: z.array(IngestionRunFailureSchema),
});

export type IngestionRun = z.infer<typeof IngestionRunSchema>;
