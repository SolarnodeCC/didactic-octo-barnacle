import { describe, expect, it } from "vitest";

import { matchPublicationIdentifiers, titleAuthorReviewKey } from "./dedupe.js";

describe("REQ-DATA-007: cross-source deduplication matching", () => {
  it("REQ-DATA-007: matches on normalized DOI first", () => {
    const match = matchPublicationIdentifiers(
      { Doi: "https://doi.org/10.1000/XYZ", ArxivId: "2401.11111" },
      { Doi: "10.1000/xyz", ArxivId: "2401.22222" },
    );
    expect(match).toEqual({ Kind: "doi", Value: "10.1000/xyz" });
  });

  it("REQ-DATA-007: matches on arXiv id when DOI is absent", () => {
    const match = matchPublicationIdentifiers(
      { ArxivId: "2401.12345v3" },
      { ArxivId: "2401.12345v1" },
    );
    expect(match).toEqual({ Kind: "arxiv", Value: "2401.12345" });
  });

  it("REQ-DATA-007: matches on OpenAlex ids when DOI and arXiv are absent", () => {
    const match = matchPublicationIdentifiers(
      { OpenAlexIds: ["W123", "W999"] },
      { OpenAlexIds: ["w999"] },
    );
    expect(match).toEqual({ Kind: "openalex", Value: "w999" });
  });

  it("REQ-DATA-007: returns none when identifiers do not match", () => {
    const match = matchPublicationIdentifiers(
      { Doi: "10.1000/a", ArxivId: "2401.1", OpenAlexIds: ["W1"] },
      { Doi: "10.1000/b", ArxivId: "2401.2", OpenAlexIds: ["W2"] },
    );
    expect(match).toEqual({ Kind: "none" });
  });

  it("REQ-DATA-007: builds a stable title-author review key without auto-merging", () => {
    expect(titleAuthorReviewKey("Hello, World!", "Ada Lovelace")).toBe("hello world|ada lovelace");
  });
});
