import { describe, expect, it } from "vitest";

import { isStorablePdfLicense } from "./document.js";

describe("REQ-DATA-010: content licensing for PDF storage", () => {
  it("REQ-DATA-010: allows only recorded storable licenses", () => {
    expect(isStorablePdfLicense("cc-by")).toBe(true);
    expect(isStorablePdfLicense("CC0")).toBe(true);
    expect(isStorablePdfLicense("arxiv-nonexclusive-distrib")).toBe(false);
    expect(isStorablePdfLicense(null)).toBe(false);
    expect(isStorablePdfLicense(undefined)).toBe(false);
  });
});
