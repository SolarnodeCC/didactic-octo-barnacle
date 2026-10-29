import { describe, expect, it } from "vitest";

import { normalizeDoi, parseArxivVersion, stripArxivVersion } from "./common.js";

describe("REQ-DATA-007: DOI and arXiv identifier helpers", () => {
  it("REQ-DATA-007: normalizes DOI by lowercasing and stripping the doi.org prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
    expect(normalizeDoi("HTTP://DOI.ORG/10.1000/ABC")).toBe("10.1000/abc");
    expect(normalizeDoi("10.1000/ABC")).toBe("10.1000/abc");
  });

  it("REQ-DATA-007: strips and parses arXiv version suffixes", () => {
    expect(stripArxivVersion("2401.12345v2")).toBe("2401.12345");
    expect(parseArxivVersion("2401.12345v2")).toBe(2);
    expect(parseArxivVersion("2401.12345")).toBeNull();
  });
});
