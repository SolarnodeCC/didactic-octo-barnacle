import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findQuoteSpan, normalizeForQuote, quoteOccurs } from "./quote.js";

type Cases = {
  normalize: Array<{ input: string; expected: string }>;
  spans: Array<{ text: string; quote: string; span: string | null }>;
};

// The same cases are asserted by scripts/tests/test_check_golden_sets.py, so the Python mirror
// in scripts/check-golden-sets.py cannot drift from this function (ADR 0064).
const cases = JSON.parse(
  readFileSync(new URL("../test-fixtures/quote-normalisation.json", import.meta.url), "utf8"),
) as Cases;

describe("REQ-AGENT-008: quote normalisation (ADR 0064)", () => {
  it.each(cases.normalize)("REQ-AGENT-008 AC2: normalises $input", ({ input, expected }) => {
    expect(normalizeForQuote(input)).toBe(expected);
  });

  it.each(cases.spans)(
    "REQ-AGENT-008 AC2: the stored quote is the matched source span for $quote",
    ({ text, quote, span }) => {
      expect(findQuoteSpan(text, quote)).toBe(span);
      expect(quoteOccurs(text, quote)).toBe(span !== null);
    },
  );

  it("REQ-AGENT-008 AC2: a quote differing only in typography occurs; case and ellipses do not", () => {
    const text = "Clinicians’ “documentation burden” grows…";
    expect(quoteOccurs(text, 'Clinicians\' "documentation burden" grows…')).toBe(true);
    expect(quoteOccurs(text, 'clinicians\' "documentation burden" grows…')).toBe(false);
    expect(quoteOccurs(text, 'Clinicians\' "documentation burden" grows...')).toBe(false);
  });

  it("REQ-AGENT-008 AC2: a span keeps surrogate pairs and combining marks whole", () => {
    expect(findQuoteSpan("x \u{1D400} café y", "\u{1D400} café")).toBe("\u{1D400} café");
  });
});
