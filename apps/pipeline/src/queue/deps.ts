import { type QueueMessageEnvelope, type SourceName } from "@roi/models";

import { type ArxivPage } from "../collectors/arxiv/client.js";
import { type OpenAlexPage } from "../collectors/openalex/client.js";
import { QUEUE_SCHEMA_VERSION, type IngestConfig } from "../config.js";
import { type AlertSink } from "../alerts/types.js";
import { type ObjectStore } from "../documents/object-store.js";
import { type FetchedPdf } from "../documents/safe-fetch.js";
import { type SqlDatabase } from "../store/sql.js";
import { type QueueSender } from "./types.js";

export type PipelineDeps = {
  Db: SqlDatabase;
  Queue: QueueSender;
  Now: () => string;
  NewId: () => string;
  Config: IngestConfig;
  /** Raises alerts for failed runs and dead-lettered messages (REQ-NFR-019); optional. */
  Alert?: AlertSink;
  /** R2 bucket for stored PDFs. */
  Documents: ObjectStore;
  /** The only way a PDF is downloaded (REQ-DATA-010 AC4). */
  FetchPdf: (url: string) => Promise<FetchedPdf>;
  Sources: {
    FetchOpenAlexPage: (request: { FromDate: string; Cursor?: string }) => Promise<OpenAlexPage>;
    FetchArxivPage: (request: { Start: number; MaxResults: number }) => Promise<ArxivPage>;
  };
  /** Structured log line; the worker writes JSON, tests can leave it out (REQ-NFR-008 AC1). */
  Log?: (event: string, fields: Record<string, unknown>) => void;
};

export type RunSource = Extract<SourceName, "openalex" | "arxiv">;

/** Deterministic ID: a page that is sent twice is the same message. */
export function fetchPageEnvelope(
  runId: string,
  source: RunSource,
  page: number,
): QueueMessageEnvelope {
  return {
    MessageId: `fetch:${runId}:${page}`,
    Type: "source.fetch_page",
    SchemaVersion: QUEUE_SCHEMA_VERSION,
    Ids: { RunId: runId, Source: source, Page: page },
    Attempt: 0,
  };
}

/** Deterministic ID: a publication is queued for its PDF at most once. */
export function documentIngestEnvelope(publicationId: string): QueueMessageEnvelope {
  return {
    MessageId: `document:${publicationId}`,
    Type: "document.ingest",
    SchemaVersion: QUEUE_SCHEMA_VERSION,
    Ids: { PublicationId: publicationId },
    Attempt: 0,
  };
}
