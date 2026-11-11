/**
 * Runtime configuration of phase 2 processing (docs/kt/phase-2/schema.md, defaults in
 * docs/kt/architecture/defaults.md). Nothing reads it yet: the consumers that use it arrive
 * in WP4 to WP7, and `Enabled` stays off until then.
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
  /** `model.max_attempts`: attempts per step, including retries (REQ-AGENT-009). */
  ModelMaxAttempts: number;
};

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  Enabled: false,
  AdmissionPoolDays: 7,
  FullTextMaxChars: 24_000,
  EmbeddingBatchSize: 50,
  RetractionLookbackDays: 30,
  PriceTableVersion: "2026-11-11",
  ModelMaxAttempts: 3,
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
