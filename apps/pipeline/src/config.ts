/**
 * Runtime defaults for scheduled ingestion. The values are the ones in
 * docs/kt/architecture/defaults.md; changing them is a reviewed pull request.
 */
export type IngestConfig = {
  /** Days re-fetched before the last successful window end (REQ-DATA-009 AC2). */
  OverlapDays: number;
  /** Days fetched by a first run, and the longest window a run may cover (AC3). */
  BackfillDays: number;
  /** Pages one run may fetch, so an unfiltered window cannot flood the database. */
  MaxPagesPerRun: number;
  PageSize: number;
  /** A run that is still `running` after this long is marked failed by the next start. */
  RunTimeoutHours: number;
  /** Seconds before the next arXiv page is delivered (`arxiv.min_request_interval_ms`). */
  ArxivPageDelaySeconds: number;
  Http: { MaxAttempts: number; BaseMs: number };
  Pdf: {
    MaxBytes: number;
    TimeoutMs: number;
    MaxRedirects: number;
    /** Empty means any public host; a list limits fetching to those hosts (REQ-DATA-010 AC4). */
    AllowedHosts: readonly string[];
  };
};

export const DEFAULT_INGEST_CONFIG: IngestConfig = {
  OverlapDays: 2,
  BackfillDays: 30,
  MaxPagesPerRun: 50,
  PageSize: 100,
  RunTimeoutHours: 6,
  ArxivPageDelaySeconds: 3,
  Http: { MaxAttempts: 3, BaseMs: 500 },
  Pdf: { MaxBytes: 25 * 1024 * 1024, TimeoutMs: 20_000, MaxRedirects: 3, AllowedHosts: [] },
};

/** Cron expressions (UTC) of docs/kt/architecture/defaults.md, one per source. */
export const CRON_SOURCES: Readonly<Record<string, "openalex" | "arxiv">> = {
  "0 6 * * *": "openalex",
  "30 7 * * *": "arxiv",
};

/** Version of the queue message schema (docs/kt/architecture/defaults.md). */
export const QUEUE_SCHEMA_VERSION = "1";
