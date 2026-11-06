import { describe, expect, it } from "vitest";

import { runExtractionEval, runTriageEval, type ModelFn } from "./eval.js";
import {
  loadExtractionSet,
  loadThreshold,
  loadTriageSet,
  type ExtractionEntry,
  type TriageEntry,
} from "./golden-set.js";

const triageSet = loadTriageSet();
const extractionSet = loadExtractionSet();

/** A stub that answers with the labels, as a perfect model would. */
function triageOracle(entries: readonly TriageEntry[]): ModelFn {
  const byId = new Map(entries.map((entry) => [entry.Publication.Id, entry.expected.signals]));
  return (publication) => {
    const s = byId.get(publication.Id);
    if (!s) {
      return Promise.reject(new Error(`no label for ${publication.Id}`));
    }
    return Promise.resolve({
      Signals: {
        NamedParty: s.namedParty,
        StatedHarm: s.statedHarm,
        Trigger: s.trigger,
        ExistingAlternative: s.existingAlternative,
        Adoptable: s.adoptable,
      },
      Notes: null,
    });
  };
}

function extractionOracle(entries: readonly ExtractionEntry[]): ModelFn {
  const byId = new Map(entries.map((entry) => [entry.Publication.Id, entry.expected]));
  return (publication) => {
    const expected = byId.get(publication.Id);
    if (!expected) {
      return Promise.reject(new Error(`no label for ${publication.Id}`));
    }
    return Promise.resolve({
      Candidates: expected.candidates.map((c) => ({
        Finding: c.finding,
        EvidenceQuote: c.evidenceQuote,
        Customer: c.customer,
        CustomerQuote: c.customerQuote,
        WhyNow: c.whyNow ?? null,
        WhyNowQuote: c.whyNowQuote ?? null,
        CurrentAlternative: c.currentAlternative ?? null,
        AlternativeQuote: c.alternativeQuote ?? null,
      })),
      Confidence: 0.6,
      Notes: expected.candidates.length === 0 ? (expected.reason ?? "none") : null,
    });
  };
}

describe("REQ-TEST-006: the golden sets load for the eval runner", () => {
  it("REQ-TEST-006: triage and extraction each hold at least 20 entries with their fixtures", () => {
    expect(triageSet.length).toBeGreaterThanOrEqual(20);
    expect(extractionSet.length).toBeGreaterThanOrEqual(20);
    expect(triageSet.every((entry) => entry.Publication.Abstract.length > 0)).toBe(true);
  });
});

describe("REQ-PROC-008: the triage eval scores signals and the code decision", () => {
  it("REQ-PROC-008: a model that reads every signal as labelled passes every entry", async () => {
    const report = await runTriageEval(triageSet, triageOracle(triageSet), loadThreshold("triage"));
    expect(report.Entries.filter((entry) => !entry.Passed)).toEqual([]);
    expect(report).toMatchObject({ PassRate: 1, Passed: true, Precision: 1, Recall: 1 });
  });

  it("REQ-PROC-008: a model that answers false everywhere fails the threshold", async () => {
    const allFalse: ModelFn = () =>
      Promise.resolve({
        Signals: {
          NamedParty: false,
          StatedHarm: false,
          Trigger: false,
          ExistingAlternative: false,
          Adoptable: false,
        },
        Notes: null,
      });
    const report = await runTriageEval(triageSet, allFalse, loadThreshold("triage"));
    expect(report.Passed).toBe(false);
    expect(report.Recall).toBe(0);
  });

  it("REQ-AGENT-011: output in a code fence is repaired, recorded, and still scored", async () => {
    const oracle = triageOracle(triageSet);
    const fenced: ModelFn = async (publication) =>
      "```json\n" + JSON.stringify(await oracle(publication)) + "\n```";
    const report = await runTriageEval(triageSet.slice(0, 3), fenced, loadThreshold("triage"));
    expect(report.PassRate).toBe(1);
    expect(report.Entries.every((entry) => entry.Repairs.includes("stripped-code-fence"))).toBe(
      true,
    );
  });

  it("REQ-AGENT-010: output that is not the contract fails the schema check", async () => {
    const prose: ModelFn = () => Promise.resolve("This paper is promising.");
    const report = await runTriageEval(triageSet.slice(0, 2), prose, loadThreshold("triage"));
    expect(report.Entries.map((entry) => entry.Failures)).toEqual([["schema"], ["schema"]]);
  });
});

describe("REQ-PROC-009: the extraction eval checks schema, quotes, and candidate count", () => {
  it("REQ-PROC-009: the labelled candidates pass every deterministic check", async () => {
    const report = await runExtractionEval(
      extractionSet,
      extractionOracle(extractionSet),
      loadThreshold("extraction"),
    );
    expect(report.Entries.filter((entry) => !entry.Passed)).toEqual([]);
    expect(report.Passed).toBe(true);
  });

  it("REQ-AGENT-008: a paraphrased quote fails the entry", async () => {
    const oracle = extractionOracle(extractionSet);
    const paraphrase: ModelFn = async (publication) => {
      const output = (await oracle(publication)) as {
        Candidates: Array<{ EvidenceQuote: string }>;
      };
      for (const candidate of output.Candidates) {
        candidate.EvidenceQuote = `In short, ${candidate.EvidenceQuote.toLowerCase()}`;
      }
      return output;
    };
    const withCandidates = extractionSet.filter((entry) => entry.expected.candidates.length > 0);
    const report = await runExtractionEval(
      withCandidates.slice(0, 3),
      paraphrase,
      loadThreshold("extraction"),
    );
    expect(report.PassRate).toBe(0);
    expect(report.Entries[0]?.Failures).toContain("quote:Candidates[0].EvidenceQuote");
  });
});
