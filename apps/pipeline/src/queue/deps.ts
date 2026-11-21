import { type QueueMessageEnvelope, type SourceName } from "@roi/models";

import { type ArxivPage } from "../collectors/arxiv/client.js";
import { type OpenAlexPage } from "../collectors/openalex/client.js";
import { QUEUE_SCHEMA_VERSION, type IngestConfig } from "../config.js";
import { type AlertSink } from "../alerts/types.js";
import { type ObjectStore } from "../documents/object-store.js";
import { type AuthorGuard } from "../privacy/author-guard.js";
import { type FetchedPdf } from "../documents/safe-fetch.js";
import { type PdfTextExtractor, type PdfTextLimits } from "../documents/pdf-text.js";
import { type SqlDatabase } from "../store/sql.js";
import { type QueueSender } from "./types.js";

export type PipelineDeps = {
  Db: SqlDatabase;
  /** Page messages (`source.fetch_page`); one at a time, in order (REQ-DATA-009). */
  Queue: QueueSender;
  /**
   * PDF messages (`document.ingest`), on their own queue so a slow download never holds up
   * the pages (ADR 0047). Without it, they share `Queue`.
   */
  DocumentQueue?: QueueSender;
  Now: () => string;
  NewId: () => string;
  Config: IngestConfig;
  /** Keeps erased authors from being stored again (REQ-NFR-016); optional. */
  AuthorGuard?: AuthorGuard;
  /** Raises alerts for failed runs and dead-lettered messages (REQ-NFR-019); optional. */
  Alert?: AlertSink;
  /** R2 bucket for stored PDFs. */
  Documents: ObjectStore;
  /** The only way a PDF is downloaded (REQ-DATA-010 AC4). */
  FetchPdf: (url: string) => Promise<FetchedPdf>;
  Sources: {
    FetchOpenAlexPage: (request: {
      FromDate: string;
      ToDate?: string;
      Cursor?: string;
      SubfieldIds?: readonly string[];
    }) => Promise<OpenAlexPage>;
    FetchArxivPage: (request: {
      Start: number;
      MaxResults: number;
      SubmittedFrom?: string;
      SubmittedTo?: string;
    }) => Promise<ArxivPage>;
  };
  /**
   * Full-text extraction of stored PDFs (REQ-DATA-006, ADR 0009). The consumer needs
   * `Extract` and `Limits`; `Queue` is set only where `processing.enabled` is on, and only
   * then does a stored PDF get a `document.extract_text` message. Optional, so a test or
   * environment without it stores PDFs as before.
   */
  Text?: {
    Queue?: QueueSender;
    Extract: PdfTextExtractor;
    Limits: PdfTextLimits & { MaxPdfBytes: number; BackfillPerRun: number };
  };
  /** Structured log line; the worker writes JSON, tests can leave it out (REQ-NFR-008 AC1). */
  Log?: (event: string, fields: Record<string, unknown>) => void;
};

/** The queue that carries `document.ingest` messages. */
export function documentQueue(deps: Pick<PipelineDeps, "Queue" | "DocumentQueue">): QueueSender {
  return deps.DocumentQueue ?? deps.Queue;
}

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

/** Deterministic ID: a stored document is queued for its text at most once. */
export function textExtractEnvelope(
  publicationId: string,
  documentId: string,
): QueueMessageEnvelope {
  return {
    MessageId: `text:${documentId}`,
    Type: "document.extract_text",
    SchemaVersion: QUEUE_SCHEMA_VERSION,
    Ids: { PublicationId: publicationId, DocumentId: documentId },
    Attempt: 0,
  };
}
