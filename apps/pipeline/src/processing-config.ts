import { type ModelConfig } from "@roi/models";

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
   * `budget.daily_eur`: the day's model budget in euro (REQ-NFR-005). Provisional: the ADR 0059
   * formula on the largest measured day (4,634 publications) and the benchmark costs
   * (triage EUR 0.00008, ADR 0088; extraction EUR 0.00177, ADR 0091; embeddings at
   * USD 0.0666 per million tokens), (0.371 + 0.177 + 0.124) x 1.5 = EUR 1.01. WP9 computes it.
   */
  BudgetDailyEur: number;
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
  EmbeddingBatchSize: 50,
  RetractionLookbackDays: 30,
  PriceTableVersion: "2026-11-11",
  TextMaxPdfBytes: 20 * 1024 * 1024,
  TextMaxPages: 100,
  TextMinChars: 200,
  TextBackfillPerRun: 500,
  AcceptScoreCut: 0.55,
  DailyExtractionLimit: 100,
  BudgetDailyEur: 1.0,
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
};

/**
 * The processing configuration for an environment. Only `processing.enabled` varies per
 * environment, through `PROCESSING_ENABLED` (`"true"` or `"false"`); the other keys change by
 * reviewed pull request. An unrecognized value throws, so a typo cannot turn processing on.
 */
export function loadProcessingConfig(vars: ProcessingVars): ProcessingConfig {
  return { ...DEFAULT_PROCESSING_CONFIG, Enabled: parseFlag(vars.PROCESSING_ENABLED) };
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
