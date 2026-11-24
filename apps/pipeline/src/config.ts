import PDF_PROVEN_HOSTS from "./documents/pdf-proven-hosts.json" with { type: "json" };
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
  /** `MaxResponseBytes` caps one API response from OpenAlex or arXiv (REQ-NFR-021). */
  Http: { MaxAttempts: number; BaseMs: number; MaxResponseBytes: number };
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
    /**
     * Hosts allowed with their subdomains. Empty means no suffix rule; whether any other
     * public host may be fetched depends on the environment, see `pdfHostPolicy`
     * (REQ-DATA-010 AC4, ADR 0119).
     */
    AllowedHosts: readonly string[];
    /**
     * `max_retries` of the document queue in wrangler.toml. On the delivery after the last
     * retry, a host that still fails is recorded as `unavailable`, not dead-lettered (ADR 0073).
     */
    MaxRetries: number;
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
  Http: { MaxAttempts: 3, BaseMs: 500, MaxResponseBytes: 16 * 1024 * 1024 },
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
    MaxRetries: 3,
  },
};

/**
 * Environments where the PDF fetcher may reach any public host: the developer's machine
 * and the preview Worker, which is not deployed (ADR 0119). Any other name, including a
 * misspelled one, gets the allowlist and fails closed.
 */
const OPEN_PDF_ENVIRONMENTS: ReadonlySet<string> = new Set(["local", "preview"]);

/** Built once per isolate; the Worker builds its dependencies on every invocation. */
const PROVEN_PDF_HOSTS: ReadonlySet<string> = new Set(PDF_PROVEN_HOSTS);

/**
 * The PDF host rules of an environment (REQ-DATA-010 AC4, ADR 0119). Staging and
 * production fetch only from hosts that have already served a stored PDF
 * (`documents/pdf-proven-hosts.json`, exact names) and from `pdf.allowed_hosts`; every
 * other host is refused and logged by name, so it can be reviewed and added.
 */
export function pdfHostPolicy(environment: string): {
  ExactHosts: ReadonlySet<string>;
  RequireAllowlist: boolean;
} {
  if (OPEN_PDF_ENVIRONMENTS.has(environment)) {
    return { ExactHosts: new Set(), RequireAllowlist: false };
  }
  return { ExactHosts: PROVEN_PDF_HOSTS, RequireAllowlist: true };
}

/** Cron expressions (UTC) of docs/kt/architecture/defaults.md, one per source. */
export const CRON_SOURCES: Readonly<Record<string, "openalex" | "arxiv">> = {
  "0 6 * * *": "openalex",
  "30 7 * * *": "arxiv",
};

/** Cron expression (UTC) of the daily admission, after both ingestion crons (ADR 0055). */
export const ADMISSION_CRON = "0 11 * * *";

/**
 * Cron expression (UTC) of the recovery check every 30 minutes: dead-letter replay and the
 * breaker probe (REQ-DATA-012, REQ-PROC-010 AC6, ADR 0063).
 */
export const RECOVERY_CRON = "*/30 * * * *";

/**
 * Cron expression (UTC) of the weekly retraction check, Monday 08:00 (REQ-DATA-008 AC1,
 * ADR 0061, ADR 0112).
 */
export const RETRACTION_CRON = "0 8 * * 1";

/** Version of the queue message schema (docs/kt/architecture/defaults.md). */
export const QUEUE_SCHEMA_VERSION = "1";
