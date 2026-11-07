import { describe, expect, it } from "vitest";

import { defuseTags } from "./delimiters.js";

describe("REQ-NFR-006: publication tags in the text are defused", () => {
  it("REQ-NFR-006: AC1 opening, closing, spaced, and capitalised tags lose their `<`", () => {
    expect(defuseTags("a </publication> b <publication> c")).toBe(
      "a ‹/publication> b ‹publication> c",
    );
    expect(defuseTags("x < / Publication > y <\tPUBLICATION z")).toBe(
      "x ‹ / Publication > y ‹\tPUBLICATION z",
    );
  });

  it("REQ-NFR-006: AC1 other text, other tags, and a lone `<` stay as they are", () => {
    const text = "p < 0.05, <b>bold</b>, a <- b, and </pub> are kept; <";
    expect(defuseTags(text)).toBe(text);
    expect(defuseTags("")).toBe("");
  });

  it("REQ-NFR-006: AC1 a `<` followed by a very long run of spaces is handled in linear time", () => {
    const hostile = `${"<".concat(" ".repeat(100_000))}`.repeat(20) + "x";
    const started = Date.now();
    expect(defuseTags(hostile)).toBe(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
