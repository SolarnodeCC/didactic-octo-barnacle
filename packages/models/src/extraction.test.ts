import { describe, expect, it } from "vitest";

import {
  ALL_CANDIDATES_FAILED_NOTE,
  DEFAULT_GENERIC_CUSTOMER_TERMS,
  applyExtractionChecks,
  customerQuoteOverlaps,
  extractionFailureMessage,
  extractionItemChecks,
  extractionMissingQuotes,
  extractionOutputSchema,
  isGenericCustomer,
} from "./extraction.js";

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

describe("REQ-PROC-009: candidate-level checks (ADR 0064, ADR 0066)", () => {
  const schema = extractionOutputSchema();
  const terms = DEFAULT_GENERIC_CUSTOMER_TERMS;

  it.each([
    "users",
    "Users",
    "the public",
    "The Public",
    "all people",
    "most  end users",
    "society",
  ])("REQ-PROC-009 AC4: %s is a generic customer", (customer) => {
    expect(isGenericCustomer(customer, terms)).toBe(true);
  });

  it.each([
    "hospital IT administrators",
    "bank risk teams",
    "public health agencies",
    "user researchers",
  ])("REQ-PROC-009 AC4: %s is not a generic customer", (customer) => {
    expect(isGenericCustomer(customer, terms)).toBe(false);
  });

  it("REQ-PROC-009 AC3: a quote that differs only in typography passes the check", () => {
    const output = schema.parse({
      Candidates: [
        { ...candidate, EvidenceQuote: "Hospitals  spend weeks reconciling claims by hand." },
      ],
      Confidence: 0.6,
      Notes: null,
    });
    expect(
      extractionMissingQuotes(output, TEXT.replace("weeks", " weeks").replace("  ", " ")),
    ).toEqual([]);
  });

  it("REQ-PROC-009 AC7: a failing candidate is dropped and listed, the others are kept with source spans", () => {
    const text = "Hospitals spend weeks “reconciling” claims by hand. Users complain.";
    const good = {
      ...candidate,
      EvidenceQuote: 'Hospitals spend weeks "reconciling" claims by hand.',
      CustomerQuote: "Hospitals",
      WhyNow: null,
      WhyNowQuote: null,
      CurrentAlternative: null,
      AlternativeQuote: null,
    };
    const generic = { ...good, Customer: "users", CustomerQuote: "Users complain." };
    const unquoted = { ...good, EvidenceQuote: "Hospitals lose money." };
    const output = schema.parse({
      Candidates: [good, generic, unquoted],
      Confidence: 0.5,
      Notes: null,
    });

    expect(extractionItemChecks(output, text, terms)).toEqual([
      { Index: 1, Field: "Customer", Reason: "generic-customer" },
      { Index: 2, Field: "EvidenceQuote", Reason: "quote-not-found" },
    ]);
    const applied = applyExtractionChecks(output, text, terms);
    expect(applied.Dropped).toHaveLength(2);
    expect(applied.Output.Candidates).toHaveLength(1);
    expect(applied.Output.Candidates[0]?.EvidenceQuote).toBe(
      "Hospitals spend weeks “reconciling” claims by hand.",
    );
    expect(applied.Output.Notes).toBeNull();
  });

  it("REQ-PROC-009 AC7: when every candidate fails, the list is empty and Notes says so", () => {
    const output = schema.parse({
      Candidates: [{ ...candidate, Customer: "people" }],
      Confidence: 0.5,
      Notes: null,
    });
    const applied = applyExtractionChecks(output, TEXT, terms);
    expect(applied.Output.Candidates).toEqual([]);
    expect(applied.Output.Notes).toBe(ALL_CANDIDATES_FAILED_NOTE);
    expect(schema.safeParse(applied.Output).success).toBe(true);
  });

  it("REQ-PROC-009 AC4: the retry names the candidate and field", () => {
    const output = schema.parse({
      Candidates: [{ ...candidate, Customer: "users" }],
      Confidence: 0.5,
      Notes: null,
    });
    expect(
      extractionFailureMessage(output, { Index: 0, Field: "Customer", Reason: "generic-customer" }),
    ).toMatch(/^Candidates\[0\]\.Customer: "users" is a generic party/u);
  });

  it("REQ-PROC-009: the customer-quote overlap check is report-only and ignores stop words and plurals", () => {
    expect(customerQuoteOverlaps("bank risk teams", "the risk team of a bank")).toBe(true);
    expect(
      customerQuoteOverlaps("hospital billing departments", "the clinicians of the ward"),
    ).toBe(false);
  });
});
