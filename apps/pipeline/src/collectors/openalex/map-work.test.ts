import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mapOpenAlexWork } from "./map-work.js";
import { type OpenAlexWork } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/openalex");

function loadWork(name: string): OpenAlexWork {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as OpenAlexWork;
}

describe("REQ-DATA-001: OpenAlex work mapping", () => {
  it("REQ-DATA-001: maps authors, topics, citations, and a reconstructed abstract", () => {
    const mapped = mapOpenAlexWork(loadWork("work-complete.json"), "2026-10-29T12:00:00Z");
    expect(mapped.Publication.Abstract).toBe(
      "Clinical decision support can surface software opportunities.",
    );
    expect(mapped.Publication.Doi).toBe("10.1000/openalex.example");
    expect(mapped.Publication.ArxivId).toBe("2409.11111");
    expect(mapped.Publication.ArxivVersion).toBe(2);
    expect(mapped.Publication.CitationCount).toBe(3);
    expect(mapped.Publication.Completeness).toBe("complete");
    expect(mapped.Authors[0]?.DisplayName).toBe("Ada Lovelace");
    expect(mapped.SourceRecord.PdfLicense).toBe("cc-by");
    expect(mapped.Publication.HasStorablePdf).toBe(true);
  });

  it("REQ-DATA-005: marks works missing an abstract as incomplete", () => {
    const mapped = mapOpenAlexWork(loadWork("work-no-abstract.json"), "2026-10-29T12:00:00Z");
    expect(mapped.Publication.Completeness).toBe("incomplete");
    expect(mapped.Publication.MissingFields).toContain("Abstract");
    expect(mapped.Publication.HasStorablePdf).toBe(false);
  });
});
