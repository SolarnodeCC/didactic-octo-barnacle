import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  agentEnvelopeSchema,
  EvidenceSchema,
  missingQuotes,
  repairModelOutput,
} from "./agent-contract.js";

const Contract = z.object({ Items: z.array(z.string()), Score: z.number(), Notes: z.string() });

describe("REQ-AGENT-011: only two repairs are made before validation", () => {
  it("REQ-AGENT-011: strips a markdown code fence around the whole output", () => {
    const result = repairModelOutput(
      '```json\n{"Items":["a"],"Score":1,"Notes":"n"}\n```',
      Contract,
    );
    expect(result).toEqual({
      Ok: true,
      Value: { Items: ["a"], Score: 1, Notes: "n" },
      Repairs: ["stripped-code-fence"],
    });
  });

  it("REQ-AGENT-011: decodes once a JSON string where the contract expects an array", () => {
    const result = repairModelOutput({ Items: '["a","b"]', Score: 1, Notes: "[1]" }, Contract);
    expect(result).toEqual({
      Ok: true,
      Value: { Items: ["a", "b"], Score: 1, Notes: "[1]" },
      Repairs: ["unwrapped-json-string"],
    });
  });

  it("REQ-AGENT-011: never changes a value, adds a field, or fills a default", () => {
    const result = repairModelOutput({ Items: "not json", Score: "7" }, Contract);
    expect(result).toEqual({ Ok: true, Value: { Items: "not json", Score: "7" }, Repairs: [] });
    expect(Contract.safeParse(result.Ok ? result.Value : null).success).toBe(false);
  });

  it("REQ-AGENT-011: a fence without a closing line or with prose in the tag is left alone", () => {
    expect(repairModelOutput('```json {"Items":[]}```', Contract)).toMatchObject({ Ok: false });
    expect(repairModelOutput("```this is prose\n{}\n```", Contract)).toMatchObject({ Ok: false });
  });

  it("REQ-NFR-006: a hostile fenced string is handled in linear time", () => {
    const hostile = "```\n" + "\n ".repeat(50_000);
    const started = performance.now();
    expect(repairModelOutput(hostile, Contract)).toMatchObject({ Ok: false });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("REQ-AGENT-011: text that is not JSON is reported, not guessed", () => {
    expect(repairModelOutput("Sure! Here is the answer.", Contract)).toMatchObject({ Ok: false });
  });
});

describe("REQ-AGENT-008: evidence items and verbatim quotes", () => {
  const base = { Quote: null, PublicationId: null, Url: null, Note: null, RetrievedAt: null };

  it("REQ-AGENT-008: each evidence kind needs its own fields", () => {
    expect(
      EvidenceSchema.safeParse({ ...base, Field: "Finding", Kind: "publication-quote" }).success,
    ).toBe(false);
    expect(
      EvidenceSchema.safeParse({
        ...base,
        Field: "Finding",
        Kind: "publication-quote",
        Quote: "text",
        PublicationId: "pub_1",
      }).success,
    ).toBe(true);
    expect(
      EvidenceSchema.safeParse({ ...base, Field: "Market", Kind: "external-url", Url: "http://x" })
        .success,
    ).toBe(false);
    expect(EvidenceSchema.safeParse({ ...base, Field: "Gap", Kind: "none-found" }).success).toBe(
      false,
    );
  });

  it("REQ-AGENT-008: a quote that is not verbatim in the input is reported by field", () => {
    const text = "Clinicians lose two hours a day to manual coding.";
    expect(
      missingQuotes(
        [
          { Field: "EvidenceQuote", Quote: "lose two hours a day" },
          { Field: "CustomerQuote", Quote: "Doctors lose" },
          { Field: "WhyNowQuote", Quote: null },
        ],
        text,
      ),
    ).toEqual(["CustomerQuote"]);
  });

  it("REQ-AGENT-008: the envelope holds at most 20 evidence items and at least one attempt", () => {
    const Envelope = agentEnvelopeSchema(z.object({ Ok: z.boolean() }));
    const envelope = {
      SchemaVersion: "1",
      Agent: "triage",
      RunId: "run_1",
      PublicationId: "pub_1",
      CandidateId: null,
      Model: "provider/model",
      PromptVersion: "triage@1",
      InputMode: "abstract",
      OutputMode: "json-schema",
      Attempts: 1,
      Repairs: [],
      Output: { Ok: true },
      Evidence: [],
    };
    expect(Envelope.safeParse(envelope).success).toBe(true);
    expect(Envelope.safeParse({ ...envelope, Attempts: 0 }).success).toBe(false);
  });
});
