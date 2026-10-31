import { PILOT_OPENALEX_TOPIC_NAMES } from "./normalize/scope.js";

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
  /** What an OpenAlex work must match to be stored (docs/kt/data-sources/ingestion-scope.md). */
  OpenAlexScope: {
    /** Field and subfield names of the topic map; a work needs one of them (REQ-DATA-001 AC1). */
    TopicNames: readonly string[];
    /**
     * OpenAlex subfield IDs (for example `1710`) sent as a server-side filter so out-of-scope
     * works are never downloaded. Empty means no server-side filter: only the name check
     * above keeps works out. Fill from the OpenAlex taxonomy; see ingestion-scope.md.
     */
    SubfieldIds: readonly string[];
  };
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
  OpenAlexScope: { TopicNames: PILOT_OPENALEX_TOPIC_NAMES, SubfieldIds: [] },
  Pdf: { MaxBytes: 25 * 1024 * 1024, TimeoutMs: 20_000, MaxRedirects: 3, AllowedHosts: [] },
};

/** Cron expressions (UTC) of docs/kt/architecture/defaults.md, one per source. */
export const CRON_SOURCES: Readonly<Record<string, "openalex" | "arxiv">> = {
  "0 6 * * *": "openalex",
  "30 7 * * *": "arxiv",
  // TEMPORARY (31 Oct 2026): one-off first run on staging. Removed again in the next PR.
  "30 16 * * *": "openalex",
  "0 17 * * *": "arxiv",
};

/** Version of the queue message schema (docs/kt/architecture/defaults.md). */
export const QUEUE_SCHEMA_VERSION = "1";
