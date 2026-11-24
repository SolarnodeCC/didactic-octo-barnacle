import { REVIEW_CORRECTED_MAX, REVIEW_NOTE_MAX } from "@roi/models";
import { describe, expect, it } from "vitest";

import { CORRECTED_MAX, NOTE_MAX, arxivUrl, doiUrl, httpsOnly, segmentAbstract } from "./text.js";

describe("REQ-REV-003: verdict limits in the browser", () => {
  it("REQ-REV-003: match the limits the API validates", () => {
    expect(NOTE_MAX).toBe(REVIEW_NOTE_MAX);
    expect(CORRECTED_MAX).toBe(REVIEW_CORRECTED_MAX);
  });
});

describe("REQ-REV-002: abstract highlighting", () => {
  it("REQ-REV-002: cuts the abstract at quote boundaries and keeps every character", () => {
    const abstract = "Pharmacists spend hours on lists.";
    const segments = segmentAbstract(abstract, [
      { Start: 0, End: 11, CandidateId: "c1", Field: "CustomerQuote" },
      { Start: 12, End: 23, CandidateId: "c1", Field: "EvidenceQuote" },
      { Start: 18, End: 33, CandidateId: "c2", Field: "EvidenceQuote" },
    ]);
    expect(segments.map((s) => s.Text).join("")).toBe(abstract);
    expect(segments).toEqual([
      { Text: "Pharmacists", CandidateIds: ["c1"] },
      { Text: " ", CandidateIds: [] },
      { Text: "spend ", CandidateIds: ["c1"] },
      { Text: "hours", CandidateIds: ["c1", "c2"] },
      { Text: " on lists.", CandidateIds: ["c2"] },
    ]);
  });

  it("REQ-REV-002: returns one plain segment without highlights", () => {
    expect(segmentAbstract("<b>text</b>", [])).toEqual([{ Text: "<b>text</b>", CandidateIds: [] }]);
  });
});

describe("REQ-NFR-013: links in the review tool", () => {
  it("REQ-NFR-013: links only https URLs", () => {
    expect(httpsOnly("https://example.org/a")).toBe("https://example.org/a");
    expect(httpsOnly("javascript:alert(1)")).toBeNull();
    expect(httpsOnly("http://example.org")).toBeNull();
    expect(httpsOnly("not a url")).toBeNull();
  });

  it("REQ-NFR-013: builds DOI and arXiv links on https", () => {
    expect(doiUrl("10.1000/paper.1")).toBe("https://doi.org/10.1000/paper.1");
    expect(arxivUrl("2611.00001")).toBe("https://arxiv.org/abs/2611.00001");
    expect(doiUrl(null)).toBeNull();
  });
});
