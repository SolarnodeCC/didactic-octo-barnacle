import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mapArxivEntry } from "./map-entry.js";
import { type ArxivEntry } from "./types.js";
import { isArxivCategoryInScope } from "../../normalize/scope.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/arxiv");

function loadEntry(name: string): ArxivEntry {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as ArxivEntry;
}

describe("REQ-DATA-002: arXiv entry mapping", () => {
  it("REQ-DATA-002: maps pilot-scope preprints and keeps version numbers", () => {
    const entry = loadEntry("entry-cs-ai.json");
    expect(isArxivCategoryInScope([entry.primaryCategory, ...entry.categories])).toBe(true);
    const mapped = mapArxivEntry(entry, "2026-10-29T12:00:00Z");
    expect(mapped.Publication.ArxivId).toBe("2409.22222");
    expect(mapped.Publication.ArxivVersion).toBe(1);
    expect(mapped.Publication.Topics).toContain("cs.AI");
    expect(mapped.Publication.HasStorablePdf).toBe(false);
    expect(mapped.SourceRecord.PdfLicense).toBeNull();
  });

  it("REQ-DATA-002: rejects categories outside the configured list", () => {
    const entry = loadEntry("entry-out-of-scope.json");
    expect(isArxivCategoryInScope([entry.primaryCategory, ...entry.categories])).toBe(false);
  });
});
