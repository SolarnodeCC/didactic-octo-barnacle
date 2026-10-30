import { z } from "zod";

import { IsoDateTimeSchema } from "./common.js";

/**
 * Licenses that allow storing a PDF in R2 (REQ-DATA-010, ADR 0014).
 * Expand only through a reviewed pull request after legal review.
 */
export const STORABLE_PDF_LICENSES = [
  "cc-by",
  "cc-by-sa",
  "cc-by-nd",
  "cc-by-nc",
  "cc-by-nc-sa",
  "cc-by-nc-nd",
  "cc0",
  "public-domain",
] as const;

export const StorablePdfLicenseSchema = z.enum(STORABLE_PDF_LICENSES);
export type StorablePdfLicense = z.infer<typeof StorablePdfLicenseSchema>;

export function isStorablePdfLicense(license: string | null | undefined): boolean {
  if (!license) {
    return false;
  }
  return (STORABLE_PDF_LICENSES as readonly string[]).includes(license.toLowerCase());
}

export const DocumentSchema = z.object({
  Id: z.string().min(1),
  PublicationId: z.string().min(1),
  ContentHash: z.string().min(1),
  StorageKey: z.string().min(1),
  License: StorablePdfLicenseSchema,
  ExtractedTextKey: z.string().min(1).nullable(),
  ExtractorVersion: z.string().min(1).nullable(),
  StoredAt: IsoDateTimeSchema,
});

export type Document = z.infer<typeof DocumentSchema>;
