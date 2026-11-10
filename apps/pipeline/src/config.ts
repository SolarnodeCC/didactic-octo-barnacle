import { SCOPE_OPENALEX_SUBFIELD_IDS, SCOPE_OPENALEX_TOPIC_NAMES } from "./normalize/scope.js";

/**
 * Runtime defaults for scheduled ingestion. The values are the ones in
 * docs/kt/architecture/defaults.md; changing them is a reviewed pull request.
 */
export type IngestConfig = {
  /** Days re-fetched before the last successful window end (REQ-DATA-009 AC2). */
  OverlapDays: number;
  /** Days fetched by a first run (REQ-DATA-009 AC3, ADR 0041). */
  BackfillDays: number;
  /**
   * The longest a window may reach back, and the limit of what a run stores: nothing dated
   * more than this many days before the day of the run (REQ-DATA-009 AC3 and AC6, ADR 0041).
   */
  MaxAgeDays: number;
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
    /** OpenAlex work types that are fetched and stored; a dataset is not a publication (ADR 0048). */
    WorkTypes: readonly string[];
    /** Fetch and store only works with an abstract (ADR 0048, REQ-DATA-005 note). */
    RequireAbstract: boolean;
  };
  Pdf: {
    MaxBytes: number;
    TimeoutMs: number;
    MaxRedirects: number;
    /** Empty means any public host; a list limits fetching to those hosts (REQ-DATA-010 AC4). */
    AllowedHosts: readonly string[];
    /** Share of a UTC day's PDF messages dead-lettered above which one alert is raised (ADR 0073). */
    DeadLetterAlertShare: number;
    /** Fewest PDF messages in a day before that share is judged (ADR 0073). */
    DeadLetterAlertMinMessages: number;
  };
};

export const DEFAULT_INGEST_CONFIG: IngestConfig = {
  OverlapDays: 2,
  BackfillDays: 14,
  MaxAgeDays: 90,
  MaxPagesPerRun: 50,
  PageSize: 100,
  RunTimeoutHours: 6,
  ArxivPageDelaySeconds: 3,
  Http: { MaxAttempts: 3, BaseMs: 500 },
  OpenAlexScope: {
    TopicNames: SCOPE_OPENALEX_TOPIC_NAMES,
    SubfieldIds: SCOPE_OPENALEX_SUBFIELD_IDS,
    WorkTypes: ["article", "preprint", "review", "conference-paper"],
    RequireAbstract: true,
  },
  Pdf: {
    MaxBytes: 25 * 1024 * 1024,
    TimeoutMs: 20_000,
    MaxRedirects: 3,
    AllowedHosts: [],
    DeadLetterAlertShare: 0.05,
    DeadLetterAlertMinMessages: 200,
  },
};

/** Cron expressions (UTC) of docs/kt/architecture/defaults.md, one per source. */
export const CRON_SOURCES: Readonly<Record<string, "openalex" | "arxiv">> = {
  "0 6 * * *": "openalex",
  "30 7 * * *": "arxiv",
};

/** Version of the queue message schema (docs/kt/architecture/defaults.md). */
export const QUEUE_SCHEMA_VERSION = "1";
