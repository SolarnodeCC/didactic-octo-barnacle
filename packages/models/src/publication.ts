import { z } from "zod";

import {
  ArxivIdSchema,
  CompletenessSchema,
  DoiSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
} from "./common.js";

export const PublicationSchema = z.object({
  Id: z.string().min(1),
  Title: z.string().min(1),
  Abstract: z.string().nullable(),
  PublicationDate: IsoDateSchema.nullable(),
  Doi: DoiSchema.nullable(),
  ArxivId: ArxivIdSchema.nullable(),
  ArxivVersion: z.number().int().positive().nullable(),
  Topics: z.array(z.string().min(1)),
  CitationCount: z.number().int().nonnegative(),
  Completeness: CompletenessSchema,
  MissingFields: z.array(z.string().min(1)),
  RetractionFlag: z.boolean(),
  Language: z.string().min(1).nullable(),
  HasStorablePdf: z.boolean(),
  CreatedAt: IsoDateTimeSchema,
  UpdatedAt: IsoDateTimeSchema,
});

export type Publication = z.infer<typeof PublicationSchema>;

/** Fields that must be present for a publication to be complete (REQ-DATA-005). */
export const REQUIRED_PUBLICATION_FIELDS = [
  "Title",
  "Abstract",
  "PublicationDate",
  "Source",
  "SourceIdentifier",
] as const;

export function missingPublicationFields(input: {
  Title?: string | null;
  Abstract?: string | null;
  PublicationDate?: string | null;
  Source?: string | null;
  SourceIdentifier?: string | null;
}): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_PUBLICATION_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
  }
  return missing;
}
