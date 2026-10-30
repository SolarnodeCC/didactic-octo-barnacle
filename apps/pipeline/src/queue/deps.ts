import { type QueueMessageEnvelope, type SourceName } from "@roi/models";

import { type ArxivPage } from "../collectors/arxiv/client.js";
import { type OpenAlexPage } from "../collectors/openalex/client.js";
import { QUEUE_SCHEMA_VERSION, type IngestConfig } from "../config.js";
import { type SqlDatabase } from "../store/sql.js";
import { type QueueSender } from "./types.js";

export type PipelineDeps = {
  Db: SqlDatabase;
  Queue: QueueSender;
  Now: () => string;
  NewId: () => string;
  Config: IngestConfig;
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
