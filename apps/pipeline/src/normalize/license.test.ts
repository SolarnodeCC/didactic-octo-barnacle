import { describe, expect, it } from "vitest";

import { normalizePdfLicense } from "./license.js";

describe("REQ-DATA-010: PDF license normalization", () => {
  it("REQ-DATA-010: accepts recorded storable licenses and rejects arXiv-only terms", () => {
    expect(normalizePdfLicense("cc-by-4.0")).toBe("cc-by");
    expect(normalizePdfLicense("CC0")).toBe("cc0");
    expect(normalizePdfLicense("arxiv-nonexclusive-distrib-1.0")).toBeNull();
    expect(normalizePdfLicense(null)).toBeNull();
  });
});
