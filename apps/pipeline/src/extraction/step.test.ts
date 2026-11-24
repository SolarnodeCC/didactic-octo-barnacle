import { describe, expect, it } from "vitest";

import { quotePositions } from "./step.js";

const TEXT = `${"a".repeat(50)}Hospitals lose records.${"b".repeat(27)}`;

describe("REQ-NFR-023: where kept quotes fall in the input (ADR 0071)", () => {
  it("REQ-NFR-023: AC1 counts each quote by the tenth of the text it starts in", () => {
    const tenths = quotePositions(
      {
        Candidates: [
          {
            Finding: "f",
            EvidenceQuote: "Hospitals lose records.",
            Customer: "hospitals",
            CustomerQuote: "aaaa",
            WhyNow: null,
            WhyNowQuote: null,
            CurrentAlternative: null,
            AlternativeQuote: "bbbb",
          },
        ],
        Confidence: 0.8,
        Notes: null,
      },
      TEXT,
    );
    expect(tenths).toEqual([1, 0, 0, 0, 0, 1, 0, 1, 0, 0]);
  });

  it("REQ-NFR-023: AC5 an empty text gives empty counts and no text", () => {
    expect(quotePositions({ Candidates: [], Confidence: 0, Notes: null }, "")).toEqual(
      Array.from({ length: 10 }, () => 0),
    );
  });
});
