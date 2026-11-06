import { describe, expect, it } from "vitest";

import { extractionMissingQuotes, extractionOutputSchema } from "./extraction.js";

const TEXT =
  "Hospitals spend weeks reconciling claims by hand. New EU rules require audit trails from 2027. Today clerks use spreadsheets.";

const candidate = {
  Finding: "Hospitals lose weeks to manual claim reconciliation.",
  EvidenceQuote: "Hospitals spend weeks reconciling claims by hand.",
  Customer: "hospital billing departments",
  CustomerQuote: "Hospitals",
  WhyNow: "EU audit-trail rules from 2027.",
  WhyNowQuote: "New EU rules require audit trails from 2027.",
  CurrentAlternative: "Spreadsheets.",
  AlternativeQuote: "Today clerks use spreadsheets.",
};

describe("REQ-PROC-009: the extraction contract", () => {
  const schema = extractionOutputSchema();

  it("REQ-PROC-009: a candidate with quoted problem, customer, trigger, and alternative is valid", () => {
    const output = { Candidates: [candidate], Confidence: 0.6, Notes: null };
    expect(schema.safeParse(output).success).toBe(true);
    expect(extractionMissingQuotes(schema.parse(output), TEXT)).toEqual([]);
  });

  it("REQ-PROC-009: WhyNow without its quote is invalid", () => {
    const output = {
      Candidates: [{ ...candidate, WhyNowQuote: null }],
      Confidence: 0.6,
      Notes: null,
    };
    expect(schema.safeParse(output).success).toBe(false);
  });

  it("REQ-PROC-009: an empty list is valid only with Notes that say why", () => {
    expect(schema.safeParse({ Candidates: [], Confidence: 0.2, Notes: null }).success).toBe(false);
    expect(
      schema.safeParse({ Candidates: [], Confidence: 0.2, Notes: "no named customer" }).success,
    ).toBe(true);
  });

  it("REQ-PROC-004: more candidates than the configured maximum are rejected", () => {
    const output = {
      Candidates: [candidate, candidate, candidate, candidate],
      Confidence: 0.6,
      Notes: null,
    };
    expect(schema.safeParse(output).success).toBe(false);
    expect(extractionOutputSchema(4).safeParse(output).success).toBe(true);
  });

  it("REQ-AGENT-008: a paraphrased quote is reported with its candidate and field", () => {
    const output = schema.parse({
      Candidates: [{ ...candidate, CustomerQuote: "Hospital billing teams" }],
      Confidence: 0.6,
      Notes: null,
    });
    expect(extractionMissingQuotes(output, TEXT)).toEqual(["Candidates[0].CustomerQuote"]);
  });
});
