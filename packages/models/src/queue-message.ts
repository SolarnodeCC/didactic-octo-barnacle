import { z } from "zod";

import { IsoDateTimeSchema } from "./common.js";

export const QueueMessageTypeSchema = z.enum([
  "publication-upserted",
  "pdf-fetch",
  "dead-letter-replay",
]);

export type QueueMessageType = z.infer<typeof QueueMessageTypeSchema>;

export const QueueMessageStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead-lettered",
]);

export type QueueMessageStatus = z.infer<typeof QueueMessageStatusSchema>;

/** Typed queue envelope: IDs only, never large payloads (REQ-DATA-011). */
export const QueueMessageEnvelopeSchema = z.object({
  MessageId: z.string().min(1),
  Type: QueueMessageTypeSchema,
  SchemaVersion: z.string().min(1),
  PublicationId: z.string().min(1).optional(),
  SourceRecordId: z.string().min(1).optional(),
  RunId: z.string().min(1).optional(),
});

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
