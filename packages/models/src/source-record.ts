import { z } from "zod";

import { IsoDateTimeSchema, SourceNameSchema } from "./common.js";

export const SourceRecordSchema = z.object({
  Id: z.string().min(1),
  PublicationId: z.string().min(1),
  Source: SourceNameSchema,
  SourceId: z.string().min(1),
  FetchedAt: IsoDateTimeSchema,
  MetadataLicense: z.string().min(1).nullable(),
  OpenAccessUrl: z.string().url().nullable(),
  PdfUrl: z.string().url().nullable(),
  PdfLicense: z.string().min(1).nullable(),
});

export type SourceRecord = z.infer<typeof SourceRecordSchema>;
