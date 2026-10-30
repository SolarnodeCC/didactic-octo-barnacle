import { isStorablePdfLicense, type StorablePdfLicense } from "@roi/models";

const LICENSE_ALIASES: Record<string, StorablePdfLicense> = {
  "cc-by": "cc-by",
  "cc by": "cc-by",
  "cc-by-4.0": "cc-by",
  "cc-by-sa": "cc-by-sa",
  "cc-by-nd": "cc-by-nd",
  "cc-by-nc": "cc-by-nc",
  "cc-by-nc-sa": "cc-by-nc-sa",
  "cc-by-nc-nd": "cc-by-nc-nd",
  cc0: "cc0",
  "cc-zero": "cc0",
  "public-domain": "public-domain",
  "public domain": "public-domain",
};

/**
 * Map a source license string to a storable license token, or null when storage
 * is not allowed (REQ-DATA-010, ADR 0014).
 */
export function normalizePdfLicense(license: string | null | undefined): StorablePdfLicense | null {
  if (!license) {
    return null;
  }
  const key = license.trim().toLowerCase().replace(/_/g, "-");
  const mapped = LICENSE_ALIASES[key];
  if (mapped && isStorablePdfLicense(mapped)) {
    return mapped;
  }
  if (isStorablePdfLicense(key)) {
    return key as StorablePdfLicense;
  }
  return null;
}
