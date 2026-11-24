import { z } from "zod";

import { type InputMode } from "./agent-contract.js";
import { type TriageReason, type TriageSignals } from "./triage.js";

/**
 * Contracts of the owner review tool (`apps/review`, ADR 0116, REQ-REV-001 to REQ-REV-004).
 * The request schemas are validated by the Worker; the response types are shared with the
 * single-page app, which imports them as types only.
 */

export const ReviewTargetKindSchema = z.enum(["triage", "candidate"]);
export type ReviewTargetKind = z.infer<typeof ReviewTargetKindSchema>;

export const ReviewVerdictSchema = z.enum(["correct", "incorrect", "unsure"]);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

/** Limits of REQ-REV-003 AC1. */
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_CORRECTED_MAX = 2000;

/** Rows per page of the review list (REQ-REV-001 AC3). */
export const REVIEW_PAGE_SIZE_MAX = 50;

/** Body of `POST /api/review/verdicts` (REQ-REV-003). Empty strings count as absent. */
export const RecordVerdictRequestSchema = z
  .object({
    TargetKind: ReviewTargetKindSchema,
    TargetId: z.string().min(1).max(200),
    Verdict: ReviewVerdictSchema,
    Note: z
      .string()
      .max(REVIEW_NOTE_MAX)
      .nullish()
      .transform((value) => (value ? value : null)),
    Corrected: z
      .string()
      .max(REVIEW_CORRECTED_MAX)
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .strict();
export type RecordVerdictRequest = z.input<typeof RecordVerdictRequestSchema>;
export type RecordVerdict = z.output<typeof RecordVerdictRequestSchema>;

const YesNo = z.enum(["yes", "no"]);

/** Query of `GET /api/review/publications` (REQ-REV-001 AC2, AC3). */
export const ReviewListQuerySchema = z
  .object({
    Accepted: YesNo.optional(),
    Reason: z.string().min(1).max(40).optional(),
    Reviewed: YesNo.optional(),
    PromptVersion: z.string().min(1).max(100).optional(),
    Day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    Cursor: z.string().min(1).max(400).optional(),
    Limit: z.coerce.number().int().min(1).max(REVIEW_PAGE_SIZE_MAX).default(REVIEW_PAGE_SIZE_MAX),
  })
  .strict();
export type ReviewListQuery = z.output<typeof ReviewListQuerySchema>;

/** The current verdict on a target: the newest one (REQ-REV-003 AC2). */
export type CurrentVerdict = {
  Verdict: ReviewVerdict;
  Note: string | null;
  Corrected: string | null;
  CreatedAt: string;
};

export type ReviewListItem = {
  PublicationId: string;
  Title: string;
  PublishedAt: string | null;
  TriageId: string;
  TriageAccepted: boolean;
  TriageReason: TriageReason | null;
  TriagePromptVersion: string | null;
  DecidedAt: string;
  CandidateCount: number;
  /** Targets (the triage decision and its candidates) with a current verdict. */
  ReviewedTargets: number;
  /** All targets: one triage decision plus every visible candidate. */
  Targets: number;
};

export type ReviewListResponse = {
  Items: ReviewListItem[];
  NextCursor: string | null;
};

export type ReviewTriage = {
  Id: string;
  Status: "decided" | "awaiting-admission";
  Accepted: boolean;
  Score: number | null;
  Reason: TriageReason | null;
  Signals: TriageSignals | null;
  Notes: string | null;
  Model: string | null;
  PromptVersion: string | null;
  CreatedAt: string;
  Current: CurrentVerdict | null;
};

export type ReviewExtraction = {
  Id: string;
  Model: string;
  PromptVersion: string;
  InputMode: InputMode;
  Confidence: number;
  Notes: string | null;
  CreatedAt: string;
};

/** The quote fields of a candidate, in display order. */
export const CANDIDATE_QUOTE_FIELDS = [
  "EvidenceQuote",
  "CustomerQuote",
  "WhyNowQuote",
  "AlternativeQuote",
] as const;
export type CandidateQuoteField = (typeof CANDIDATE_QUOTE_FIELDS)[number];

export type ReviewCandidate = {
  Id: string;
  Finding: string;
  EvidenceQuote: string;
  Customer: string;
  CustomerQuote: string;
  WhyNow: string | null;
  WhyNowQuote: string | null;
  CurrentAlternative: string | null;
  AlternativeQuote: string | null;
  Current: CurrentVerdict | null;
};

/** A span of the abstract that a candidate quotes (REQ-REV-002 AC4). Offsets are UTF-16. */
export type AbstractHighlight = {
  Start: number;
  End: number;
  CandidateId: string;
  Field: CandidateQuoteField;
};

export type ReviewDetailResponse = {
  Publication: {
    Id: string;
    Title: string;
    Abstract: string | null;
    PublishedAt: string | null;
    Doi: string | null;
    ArxivId: string | null;
  };
  Triage: ReviewTriage;
  Extraction: ReviewExtraction | null;
  Candidates: ReviewCandidate[];
  Highlights: AbstractHighlight[];
  /** Neighbours in the default list order, for keyboard navigation (REQ-REV-003 AC4). */
  PreviousId: string | null;
  NextId: string | null;
};

export type ReviewStatsRow = {
  TargetKind: ReviewTargetKind;
  PromptVersion: string | null;
  Correct: number;
  Incorrect: number;
  Unsure: number;
  /** Correct / (correct + incorrect), or null when neither exists (REQ-REV-004 AC1). */
  Agreement: number | null;
};

export type ReviewStatsResponse = { Rows: ReviewStatsRow[] };

/** One line of the JSON-lines export (REQ-REV-004 AC2). */
export type ReviewExportLine = {
  Id: string;
  TargetKind: ReviewTargetKind;
  TargetId: string;
  PublicationId: string;
  Verdict: ReviewVerdict;
  Note: string | null;
  Corrected: string | null;
  Model: string | null;
  PromptVersion: string | null;
  CreatedAt: string;
};

/** Share of correct verdicts among the decided ones (REQ-REV-004 AC1). */
export function agreementRate(correct: number, incorrect: number): number | null {
  const decided = correct + incorrect;
  return decided === 0 ? null : correct / decided;
}
