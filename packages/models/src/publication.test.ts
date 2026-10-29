import { describe, expect, it } from "vitest";

import { missingPublicationFields, PublicationSchema } from "./publication.js";

describe("REQ-DATA-005: metadata extraction completeness", () => {
  it("REQ-DATA-005: lists missing required fields", () => {
    expect(
      missingPublicationFields({
        Title: "A paper",
        Abstract: null,
        PublicationDate: "2026-01-01",
        Source: "openalex",
        SourceIdentifier: "W1",
      }),
    ).toEqual(["Abstract"]);
  });

  it("REQ-DATA-005: parses a complete publication record", () => {
    const parsed = PublicationSchema.parse({
      Id: "pub_1",
      Title: "A paper",
      Abstract: "Something useful.",
      PublicationDate: "2026-01-15",
      Doi: "https://doi.org/10.1000/Test",
      ArxivId: "2401.12345v1",
      ArxivVersion: 1,
      Topics: ["cs.AI"],
      CitationCount: 0,
      Completeness: "complete",
      MissingFields: [],
      RetractionFlag: false,
      Language: "en",
      HasStorablePdf: false,
      CreatedAt: "2026-01-15T12:00:00Z",
      UpdatedAt: "2026-01-15T12:00:00Z",
    });
    expect(parsed.Doi).toBe("10.1000/test");
  });
});
