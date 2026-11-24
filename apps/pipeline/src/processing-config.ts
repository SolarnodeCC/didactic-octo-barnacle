import {
  DEFAULT_GENERIC_CUSTOMER_TERMS,
  DEFAULT_MAX_CANDIDATES,
  type ModelConfig,
} from "@roi/models";

import { type BudgetEstimate } from "./budget/daily-budget.js";

/**
 * Runtime configuration of phase 2 processing (docs/kt/phase-2/schema.md, defaults in
 * docs/kt/architecture/defaults.md). The text consumer of WP4 reads the `text.*` keys; the
 * consumers of WP5 to WP7 read the others. `Enabled` stays off until an environment turns it on.
 */
export type ProcessingConfig = {
  /** `processing.enabled`: turns the phase 2 consumers on per environment. */
  Enabled: boolean;
  /** `triage.admission_pool_days`: how long a passing publication waits for admission (ADR 0055). */
  AdmissionPoolDays: number;
  /** `extraction.full_text_max_chars`: cut before the call; the quote check uses the cut text. */
  FullTextMaxChars: number;
  /** `extraction.max_candidates_per_publication`: the hard cap on candidates (REQ-PROC-004 AC2). */
  MaxCandidates: number;
  /**
   * `extraction.generic_customer_terms`: parties that never count as `Customer` (REQ-PROC-009
   * AC4, ADR 0066). Changes by reviewed pull request.
   */
  GenericCustomerTerms: readonly string[];
  /** `embedding.batch_size`: messages per embedding call. */
  EmbeddingBatchSize: number;
  /** `retraction.lookback_days`: how far back the weekly retraction check looks (ADR 0061). */
  RetractionLookbackDays: number;
  /** `model.price_table_version`: price table used when the gateway gives no cost (REQ-NFR-011 AC2). */
  PriceTableVersion: string;
  /**
   * `text.max_pdf_bytes`: a stored PDF larger than this is not opened for its text, so one
   * file cannot exhaust the Worker's memory (ADR 0009, measured in WP4).
   */
  TextMaxPdfBytes: number;
  /** `text.max_pages`: a PDF with more pages is not read (ADR 0009, measured in WP4). */
  TextMaxPages: number;
  /** `text.min_chars`: less text than this means no usable text layer, as in a scan. */
  TextMinChars: number;
  /**
   * `text.backfill_per_run`: stored PDFs without text that each ingestion start queues for
   * extraction, so PDFs stored before WP4 get their text too.
   */
  TextBackfillPerRun: number;
  /** `triage.accept_score_cut`: the share of true signals a publication needs (REQ-PROC-008). */
  AcceptScoreCut: number;
  /** `ingestion.daily_extraction_limit`: publications admitted to extraction a UTC day (REQ-PROC-005). */
  DailyExtractionLimit: number;
  /**
   * `extraction.full_text_wait_hours`: how long the admission waits for a publication's full
   * text before it admits it on the abstract (ADR 0065, REQ-PROC-011).
   */
  FullTextWaitHours: number;
  /**
   * `budget.expected_daily_triaged`: triage calls a day in the budget formula, per environment
   * (`BUDGET_EXPECTED_DAILY_TRIAGED`). The largest measured day until a steady state is known
   * (ADR 0059).
   */
  ExpectedDailyTriaged: number;
  /** `budget.expected_daily_embeddings`: embeddings a day, per environment (`BUDGET_EXPECTED_DAILY_EMBEDDINGS`). */
  ExpectedDailyEmbeddings: number;
  /** `budget.phase2_multiplier`: the margin on the daily budget (ADR 0059). */
  BudgetMultiplier: number;
  /**
   * `budget.measured_cost_days` and `budget.measured_cost_min_items`: the measured cost per item
   * replaces the estimate once this many items over this many complete days are behind it
   * (ADR 0032).
   */
  BudgetMeasuredDays: number;
  BudgetMeasuredMinItems: number;
  /** The estimate behind the budget until a cost is measured (ADR 0032, ADR 0059). */
  BudgetEstimate: BudgetEstimate;
  /**
   * `monitor.baseline_days`, `monitor.drift_band`, `monitor.min_daily_items`, and
   * `monitor.near_duplicate_cosine`: the daily quality section and its drift alert (ADR 0071).
   */
  MonitorBaselineDays: number;
  MonitorDriftBand: number;
  MonitorMinDailyItems: number;
  MonitorNearDuplicateCosine: number;
  /** `recovery.max_redrives`: re-drives of an item's failed step before it is failed-final (ADR 0063). */
  MaxRedrives: number;
  /** `recovery.max_redrives_per_day`: items re-driven a UTC day (ADR 0063). */
  MaxRedrivesPerDay: number;
  /** `recovery.dead_letter_replay_hours`: delay before a dead letter is replayed, at most twice (REQ-DATA-012). */
  DeadLetterReplayHours: number;
  /** `recovery.breaker_failure_share`: share of `provider-error` calls in an hour that pauses a step. */
  BreakerFailureShare: number;
  /**
   * `recovery.breaker_min_calls`: calls a step needs in the hour before the share is judged, so
   * one failed call at the start of a day does not pause the step (WP6).
   */
  BreakerMinCalls: number;
  /** `model.max_attempts`: attempts per step, including retries (REQ-AGENT-009). */
  ModelMaxAttempts: number;
  /**
   * `model.triage`: the model of the triage step, chosen by benchmark round two (ADR 0088,
   * OQ-036). Temperature and output budget come with the prompt version (`TRIAGE_SAMPLING`).
   */
  TriageModel: ModelConfig;
  /**
   * `model.extraction`: the model of the extraction step, chosen by benchmark round three
   * (ADR 0091, OQ-036), at its default reasoning. Temperature and output budget come with the
   * prompt version (`EXTRACTION_SAMPLING`).
   */
  ExtractionModel: ModelConfig;
};

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  Enabled: false,
  AdmissionPoolDays: 7,
  FullTextMaxChars: 24_000,
  MaxCandidates: DEFAULT_MAX_CANDIDATES,
  GenericCustomerTerms: DEFAULT_GENERIC_CUSTOMER_TERMS,
  EmbeddingBatchSize: 50,
  RetractionLookbackDays: 30,
  PriceTableVersion: "2026-11-11",
  TextMaxPdfBytes: 20 * 1024 * 1024,
  TextMaxPages: 100,
  TextMinChars: 200,
  TextBackfillPerRun: 500,
  AcceptScoreCut: 0.55,
  DailyExtractionLimit: 100,
  FullTextWaitHours: 24,
  ExpectedDailyTriaged: 100,
  ExpectedDailyEmbeddings: 100,
  BudgetMultiplier: 1.5,
  BudgetMeasuredDays: 7,
  BudgetMeasuredMinItems: 20,
  BudgetEstimate: {
    TriageUsdPerItem: 0.0000876,
    ExtractionUsdPerItem: 0.002344,
    MeanAbstractTokens: 373,
    CharsPerToken: 4,
    EmbeddingInputTokens: 400,
  },
  MonitorBaselineDays: 14,
  MonitorDriftBand: 0.5,
  MonitorMinDailyItems: 20,
  MonitorNearDuplicateCosine: 0.92,
  MaxRedrives: 3,
  MaxRedrivesPerDay: 20,
  DeadLetterReplayHours: 6,
  BreakerFailureShare: 0.5,
  BreakerMinCalls: 10,
  ModelMaxAttempts: 3,
  TriageModel: {
    Model: "@cf/google/gemma-4-26b-a4b-it",
    PromptVersion: "triage@2",
    OutputMode: "json-schema",
    Reasoning: { Thinking: false },
  },
  ExtractionModel: {
    Model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
    PromptVersion: "extraction@4",
    OutputMode: "json-schema",
  },
};

/** The Worker variables the loader reads; every one is optional and falls back to the default. */
export type ProcessingVars = {
  PROCESSING_ENABLED?: string;
  BUDGET_EXPECTED_DAILY_TRIAGED?: string;
  BUDGET_EXPECTED_DAILY_EMBEDDINGS?: string;
};

/**
 * The processing configuration for an environment. `processing.enabled` and the two expected
 * daily volumes of the budget vary per environment (`wrangler.toml` vars); the other keys
 * change by reviewed pull request. An unrecognized value throws, so a typo cannot turn
 * processing on or change the budget.
 */
export function loadProcessingConfig(vars: ProcessingVars): ProcessingConfig {
  return {
    ...DEFAULT_PROCESSING_CONFIG,
    Enabled: parseFlag(vars.PROCESSING_ENABLED),
    ExpectedDailyTriaged: parseCount(
      "BUDGET_EXPECTED_DAILY_TRIAGED",
      vars.BUDGET_EXPECTED_DAILY_TRIAGED,
      DEFAULT_PROCESSING_CONFIG.ExpectedDailyTriaged,
    ),
    ExpectedDailyEmbeddings: parseCount(
      "BUDGET_EXPECTED_DAILY_EMBEDDINGS",
      vars.BUDGET_EXPECTED_DAILY_EMBEDDINGS,
      DEFAULT_PROCESSING_CONFIG.ExpectedDailyEmbeddings,
    ),
  };
}

function parseCount(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^\d+$/u.test(trimmed)) {
    throw new Error(`${name} must be a whole number, got "${value}"`);
  }
  return Number(trimmed);
}

function parseFlag(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PROCESSING_CONFIG.Enabled;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`PROCESSING_ENABLED must be "true" or "false", got "${value}"`);
}
