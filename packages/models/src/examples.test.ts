import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { EvidenceSchema } from "./agent-contract.js";
import { ExtractionCandidateSchema, extractionOutputSchema } from "./extraction.js";
import {
  AGENT_OUTPUT_SCHEMAS,
  AGENT_STEPS,
  OpportunityScoreSchema,
  STEP_AGENTS,
} from "./opportunity.js";
import { quoteOccurs } from "./quote.js";
import { TriageSignalsSchema } from "./triage.js";

/**
 * The product examples are validated against the schemas (REQ-PROC-007 AC3,
 * docs/kt/examples/README.md), so the thin slice's stub outputs have the final output shape.
 */

const examples = (name: string): Record<string, unknown> =>
  parse(
    readFileSync(new URL(`../../../docs/kt/examples/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;

type Opportunity = {
  Publication: { Id: string; Abstract: string };
  Candidate: Record<string, unknown> & { Id: string };
  Agents: Record<string, Record<string, unknown> & { Evidence?: unknown[] }>;
  Score: unknown;
};

describe("REQ-PROC-007: the examples match the packages/models schemas", () => {
  const example = examples("context-switching-opportunity.yaml") as unknown as Opportunity;

  it("REQ-PROC-007: AC3 the candidate is a valid extraction candidate with quotes from its abstract", () => {
    const { Id: _id, ...candidate } = example.Candidate;
    const parsed = ExtractionCandidateSchema.parse(candidate);
    for (const quote of [
      parsed.EvidenceQuote,
      parsed.CustomerQuote,
      parsed.WhyNowQuote,
      parsed.AlternativeQuote,
    ]) {
      if (quote !== null) {
        expect(quoteOccurs(example.Publication.Abstract, quote), quote).toBe(true);
      }
    }
  });

  it.each(AGENT_STEPS)(
    "REQ-PROC-007: AC3 the %s section is a valid output with valid evidence",
    (step) => {
      const section = example.Agents[STEP_AGENTS[step]];
      expect(section, STEP_AGENTS[step]).toBeDefined();
      const { Evidence = [], ...output } = section ?? {};
      expect(() => AGENT_OUTPUT_SCHEMAS[step].parse(output)).not.toThrow();
      for (const item of Evidence) {
        expect(() => EvidenceSchema.parse(item)).not.toThrow();
      }
    },
  );

  it("REQ-PROC-007: AC3 every agent section belongs to a pipeline step", () => {
    expect(Object.keys(example.Agents).sort()).toEqual(Object.values(STEP_AGENTS).sort());
  });

  it("REQ-PROC-007: AC3 the score is a valid score with the band of its value", () => {
    expect(OpportunityScoreSchema.parse(example.Score)).toMatchObject({
      OpportunityScore: 71,
      Band: "High",
    });
  });

  it("REQ-PROC-007: AC3 the no-opportunity example is a valid triage decision and an empty extraction", () => {
    const empty = examples("no-opportunity.yaml") as {
      Triage: { Signals: unknown };
      Extraction: unknown;
      Opportunity: unknown;
    };
    expect(() => TriageSignalsSchema.parse(empty.Triage.Signals)).not.toThrow();
    expect(extractionOutputSchema(3).parse(empty.Extraction)).toMatchObject({ Candidates: [] });
    expect(empty.Opportunity).toBeNull();
  });
});
