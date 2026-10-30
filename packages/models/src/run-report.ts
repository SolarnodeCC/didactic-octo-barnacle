import { z } from "zod";

import { IsoDateTimeSchema, SourceNameSchema } from "./common.js";
import {
  IngestionRunCountsSchema,
  IngestionRunFailureSchema,
  IngestionRunStatusSchema,
} from "./ingestion-run.js";

/**
 * Run report of one ingestion run (REQ-NFR-008 AC2): counts and failed items, plus the
 * dead-lettered messages and a few data-quality counters (docs/kt/test/README.md).
 * It holds IDs, counts, and short reasons, never publication text.
 */
export const RunReportSchema = z.object({
  RunId: z.string().min(1),
  Source: SourceNameSchema,
  Status: IngestionRunStatusSchema,
  StartedAt: IsoDateTimeSchema,
  EndedAt: IsoDateTimeSchema.nullable(),
  WindowFrom: z.string().nullable(),
  PagesDone: z.number().int().nonnegative(),
  Counts: IngestionRunCountsSchema,
  Failures: z.array(IngestionRunFailureSchema),
  /** Message IDs of dead-lettered messages created during the run. */
  DeadLetteredMessages: z.array(z.string().min(1)),
  DataQuality: z.object({
    /** Publications touched during the run that are marked incomplete (REQ-DATA-005). */
    IncompleteRecords: z.number().int().nonnegative(),
    /** Title-and-first-author matches flagged for review during the run (REQ-DATA-007). */
    DuplicatesFlagged: z.number().int().nonnegative(),
    /** PDFs refused or dead-lettered during the run (REQ-DATA-010). */
    FailedPdfs: z.number().int().nonnegative(),
  }),
});

export type RunReport = z.infer<typeof RunReportSchema>;

/** Events that raise an alert (REQ-NFR-019 AC1). */
export const AlertTypeSchema = z.enum([
  "failed-run",
  "run-timeout",
  "dead-letter",
  "budget-stop",
  "availability-breach",
]);

export type AlertType = z.infer<typeof AlertTypeSchema>;
