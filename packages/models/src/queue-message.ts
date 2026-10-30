import { z } from "zod";

import { IsoDateTimeSchema, SourceNameSchema } from "./common.js";

/**
 * Message types of docs/kt/architecture/defaults.md. A type is added here when its
 * producer and consumer exist; `document.ingest` arrives with REQ-DATA-004.
 */
export const QueueMessageTypeSchema = z.enum(["source.fetch_page"]);

export type QueueMessageType = z.infer<typeof QueueMessageTypeSchema>;

export const QueueMessageStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead-lettered",
]);

export type QueueMessageStatus = z.infer<typeof QueueMessageStatusSchema>;

/** The only values a message may carry: IDs and a page number, never a payload. */
export const QueueMessageIdsSchema = z
  .object({
    RunId: z.string().min(1).optional(),
    Source: SourceNameSchema.optional(),
    Page: z.number().int().nonnegative().optional(),
    PublicationId: z.string().min(1).optional(),
    DocumentId: z.string().min(1).optional(),
  })
  .strict();

export type QueueMessageIds = z.infer<typeof QueueMessageIdsSchema>;

/** Typed queue envelope: schema version, IDs, and attempt (REQ-DATA-011 AC2). */
export const QueueMessageEnvelopeSchema = z
  .object({
    MessageId: z.string().min(1),
    Type: QueueMessageTypeSchema,
    SchemaVersion: z.string().min(1),
    Ids: QueueMessageIdsSchema,
    Attempt: z.number().int().nonnegative(),
  })
  .strict();

export type QueueMessageEnvelope = z.infer<typeof QueueMessageEnvelopeSchema>;

export const QueueMessageLogSchema = z.object({
  MessageId: z.string().min(1),
  Type: QueueMessageTypeSchema,
  SchemaVersion: z.string().min(1),
  Status: QueueMessageStatusSchema,
  Attempts: z.number().int().nonnegative(),
  DeadLetter: z.boolean(),
  LastError: z.string().nullable(),
  CreatedAt: IsoDateTimeSchema,
  UpdatedAt: IsoDateTimeSchema,
});

export type QueueMessageLog = z.infer<typeof QueueMessageLogSchema>;
