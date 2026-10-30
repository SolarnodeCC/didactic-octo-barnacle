import { type AlertType, type RunReport } from "@roi/models";

/**
 * What the pipeline reports when something needs a person (REQ-NFR-019). Every field is
 * written by our own code: IDs, counts, and fixed sentences, never publication text,
 * prompts, user data, or credentials (AC4).
 */
export type AlertEvent = {
  Type: AlertType;
  /** Source name or message type; with the type and environment it forms the dedupe key. */
  Source: string;
  RunId?: string;
  MessageId?: string;
  Summary: string;
  Report?: RunReport;
};

/** Delivers an alert; it never throws, so a broken channel cannot stop the pipeline. */
export type AlertSink = (event: AlertEvent) => Promise<void>;
