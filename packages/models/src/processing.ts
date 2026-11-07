import { z } from "zod";

import { InputModeSchema } from "./agent-contract.js";
import { IsoDateSchema, IsoDateTimeSchema } from "./common.js";
import { ExtractionCandidateSchema } from "./extraction.js";
import { IngestionRunStatusSchema } from "./ingestion-run.js";
import { TriageReasonSchema, TriageSignalsSchema } from "./triage.js";

/**
 * Phase 2 processing rows (docs/kt/phase-2/schema.md, migration 0009): the processing run,
 * the triage decision, the extraction result, and the candidate.
 */

export const ProcessingRunKindSchema = z.enum(["daily", "backfill", "retraction-check", "slice"]);
export type ProcessingRunKind = z.infer<typeof ProcessingRunKindSchema>;

/** Counts of a processing run by name, for example `Triaged` or `Extracted`. */
export const ProcessingRunCountsSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);
export type ProcessingRunCounts = z.infer<typeof ProcessingRunCountsSchema>;

export const ProcessingRunFailureSchema = z.object({
  PublicationId: z.string().min(1).nullable(),
  Reason: z.string().min(1),
});
export type ProcessingRunFailure = z.infer<typeof ProcessingRunFailureSchema>;

export const ProcessingRunSchema = z.object({
  Id: z.string().min(1),
  Kind: ProcessingRunKindSchema,
  /** The UTC day the run processes; a `daily` run is unique per day. */
  Day: IsoDateSchema,
  Status: IngestionRunStatusSchema,
  StartedAt: IsoDateTimeSchema,
  EndedAt: IsoDateTimeSchema.nullable(),
  Counts: ProcessingRunCountsSchema,
  Failures: z.array(ProcessingRunFailureSchema),
});
export type ProcessingRun = z.infer<typeof ProcessingRunSchema>;

/** Reasons set by the rules before any model call (REQ-PROC-006 AC1). */
const RULE_REASONS = new Set(["incomplete", "retracted", "out-of-scope"]);

export const TriageDecisionStatusSchema = z.enum(["decided", "awaiting-admission"]);
export type TriageDecisionStatus = z.infer<typeof TriageDecisionStatusSchema>;

/**
 * One triage decision per publication. A rule rejection has no signals, score, model, or
 * prompt version (REQ-PROC-006 AC2). `Reason` is empty only while a passing publication
 * waits for its first admission (ADR 0055).
 */
export const TriageDecisionRowSchema = z
  .object({
    Id: z.string().min(1),
    PublicationId: z.string().min(1),
    RunId: z.string().min(1),
    Status: TriageDecisionStatusSchema,
    Accepted: z.boolean(),
    Score: z.number().min(0).max(1).nullable(),
    Reason: TriageReasonSchema.nullable(),
    Signals: TriageSignalsSchema.nullable(),
    Notes: z.string().max(200).nullable(),
    Model: z.string().min(1).nullable(),
    PromptVersion: z.string().min(1).nullable(),
    AdmittedOn: IsoDateSchema.nullable(),
    CreatedAt: IsoDateTimeSchema,
    UpdatedAt: IsoDateTimeSchema,
  })
  .superRefine((row, ctx) => {
    const ruled = row.Reason !== null && RULE_REASONS.has(row.Reason);
    const modelFields = [row.Signals, row.Score, row.Model, row.PromptVersion];
    if (ruled && modelFields.some((value) => value !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["Signals"],
        message: "a rule rejection has no signals, score, model, or prompt version",
      });
    }
    if (!ruled && modelFields.some((value) => value === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["Signals"],
        message: "a model decision has signals, score, model, and prompt version",
      });
    }
    if (row.Accepted !== (row.Reason === "accepted")) {
      ctx.addIssue({
        code: "custom",
        path: ["Accepted"],
        message: "Accepted is true exactly when Reason is accepted",
      });
    }
    if (row.Accepted !== (row.AdmittedOn !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["AdmittedOn"],
        message: "an accepted decision has its admission day, and only an accepted one",
      });
    }
    if (row.Reason === null && row.Status !== "awaiting-admission") {
      ctx.addIssue({
        code: "custom",
        path: ["Reason"],
        message: "only a decision awaiting admission may have no reason yet",
      });
    }
    if (
      row.Status === "awaiting-admission" &&
      row.Reason !== null &&
      row.Reason !== "daily-limit"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["Status"],
        message: "a decision awaiting admission has no reason yet or daily-limit",
      });
    }
  });
export type TriageDecisionRow = z.infer<typeof TriageDecisionRowSchema>;

/** Cap on `Confidence` when only the abstract was read (contract conventions). */
export const ABSTRACT_CONFIDENCE_CAP = 0.7;

/** One extraction result per publication; its candidates are separate rows. */
export const ExtractionResultRowSchema = z
  .object({
    Id: z.string().min(1),
    PublicationId: z.string().min(1),
    RunId: z.string().min(1),
    Model: z.string().min(1),
    PromptVersion: z.string().min(1),
    InputMode: InputModeSchema,
    Confidence: z.number().min(0).max(1),
    Notes: z.string().max(400).nullable(),
    CandidateCount: z.number().int().nonnegative(),
    CreatedAt: IsoDateTimeSchema,
  })
  .superRefine((row, ctx) => {
    if (row.InputMode === "abstract" && row.Confidence > ABSTRACT_CONFIDENCE_CAP) {
      ctx.addIssue({
        code: "custom",
        path: ["Confidence"],
        message: `abstract-only input caps Confidence at ${ABSTRACT_CONFIDENCE_CAP}`,
      });
    }
  });
export type ExtractionResultRow = z.infer<typeof ExtractionResultRowSchema>;

export const CandidateHiddenReasonSchema = z.enum(["retracted"]);
export type CandidateHiddenReason = z.infer<typeof CandidateHiddenReasonSchema>;

/** A stored candidate: the extraction contract fields plus its keys (REQ-PROC-004). */
export const CandidateRowSchema = z.intersection(
  ExtractionCandidateSchema,
  z.object({
    Id: z.string().min(1),
    PublicationId: z.string().min(1),
    ExtractionResultId: z.string().min(1),
    HiddenReason: CandidateHiddenReasonSchema.nullable(),
    CreatedAt: IsoDateTimeSchema,
  }),
);
export type CandidateRow = z.infer<typeof CandidateRowSchema>;
