import { containsPlantedInstruction } from "@roi/models";
import { describe, expect, it } from "vitest";

import { CLOSE_TAG, DATA_NOT_INSTRUCTIONS, OPEN_TAG } from "./delimiters.js";
import { buildExtractionPrompt } from "./extraction.js";
import { INJECTION_PAYLOADS } from "./injection-corpus.js";
import { buildProblemDiscoveryPrompt } from "./problem-discovery.js";
import { buildRelevancePrompt } from "./relevance.js";
import { buildResearchAnalystPrompt } from "./research-analyst.js";
import { buildTriagePrompt } from "./triage.js";

const ABSTRACT = "Grid operators lose millions each year to unplanned transformer outages.";

/** Every prompt builder, fed a publication or candidate that carries the payload. */
const BUILDERS: Array<[string, (payload: string) => { System: string; User: string }]> = [
  ["triage", (p) => buildTriagePrompt({ Title: "T", Abstract: `${ABSTRACT} ${p}` }).Prompt],
  [
    "extraction (abstract)",
    (p) =>
      buildExtractionPrompt({ Title: "T", Abstract: `${ABSTRACT} ${p}`, FullText: null }).Prompt,
  ],
  [
    "extraction (full text)",
    (p) => buildExtractionPrompt({ Title: "T", Abstract: ABSTRACT, FullText: `Body. ${p}` }).Prompt,
  ],
  [
    "research analyst",
    (p) =>
      buildResearchAnalystPrompt({
        Title: "T",
        Abstract: ABSTRACT,
        Finding: "Outages cost money.",
        Customer: "grid operators",
        Related: [
          { Id: "http://arxiv.org/abs/1", Title: "R", Abstract: p, Published: "2026-01-02" },
        ],
      }).Prompt,
  ],
  [
    "problem discovery",
    (p) =>
      buildProblemDiscoveryPrompt({
        Title: "T",
        Abstract: `${ABSTRACT} ${p}`,
        Candidate: {
          Finding: "Outages cost money.",
          EvidenceQuote: ABSTRACT,
          Customer: "grid operators",
          CustomerQuote: "Grid operators",
          WhyNow: null,
          CurrentAlternative: null,
        },
        ResearchAnalyst: {
          Novelty: 40,
          Maturity: "prototype",
          Industry: ["energy-utilities"],
          Technology: ["anomaly detection"],
        },
      }).Prompt,
  ],
  [
    "relevance",
    (p) =>
      buildRelevancePrompt({
        Candidate: {
          Finding: `Outages cost money. ${p}`,
          Customer: "grid operators",
          WhyNow: null,
          WhyNowQuote: null,
          CurrentAlternative: null,
          AlternativeQuote: null,
        },
        ResearchAnalyst: {
          Maturity: "prototype",
          Industry: ["energy-utilities"],
          Technology: ["anomaly detection"],
        },
        ProblemDiscovery: {
          Problem: "Outages cost money.",
          CustomerIndustry: "energy-utilities",
          PainLevel: "3 to 4",
        },
      }).Prompt,
  ],
];

describe("REQ-NFR-006: every prompt keeps the adversarial corpus inside one data block (ADR 0119)", () => {
  it("REQ-NFR-006: the corpus covers tag break-out, field names, fabricated quotes, JSON, and plain overrides", () => {
    expect(INJECTION_PAYLOADS.length).toBeGreaterThanOrEqual(8);
    expect(INJECTION_PAYLOADS.some((p) => p.includes("</publication>"))).toBe(true);
    expect(INJECTION_PAYLOADS.some((p) => !containsPlantedInstruction(p))).toBe(true);
  });

  for (const [name, build] of BUILDERS) {
    it.each(INJECTION_PAYLOADS.map((payload, index) => [index, payload]))(
      `REQ-NFR-006: AC1 ${name} delimits payload %i once and keeps the data-not-instructions rule`,
      (_index, payload) => {
        const prompt = build(payload as string);
        // Only fixed text of the builder may come before the block; the payload sits inside it.
        const open = prompt.User.indexOf(OPEN_TAG);
        expect(open).toBeGreaterThanOrEqual(0);
        expect(prompt.User.slice(0, open)).not.toContain((payload as string).slice(0, 20));
        expect(prompt.User.endsWith(CLOSE_TAG)).toBe(true);
        expect(prompt.User.split(/<\s*\/?\s*publication\s*>/iu)).toHaveLength(3);
        expect(prompt.System).toContain(DATA_NOT_INSTRUCTIONS);
      },
    );
  }
});
