import { TARGET_INDUSTRY_KEYS } from "@roi/models";
import { describe, expect, it } from "vitest";

import {
  FACTS_GATE,
  runProblemDiscoveryEval,
  effortWithinOneLevel,
  runRelevanceEval,
  runResearchAnalystEval,
  type EntryModelFn,
  type FactJudge,
} from "./eval.js";
import {
  loadAnalysisThreshold,
  loadProblemDiscoverySet,
  loadRelevanceSet,
  loadResearchAnalystSet,
  type ProblemDiscoveryEntry,
  type RelevanceEntry,
  type ResearchAnalystEntry,
} from "./golden-set.js";

const ra = loadResearchAnalystSet();
const pd = loadProblemDiscoverySet();
const rel = loadRelevanceSet();

/** Answers with the labels, as a perfect Research Analyst would. */
const raOracle: EntryModelFn<ResearchAnalystEntry> = (entry) =>
  Promise.resolve({
    Novelty: entry.handoff.novelty,
    NoveltyRationale: "As labelled.",
    RelatedPublicationIds: entry.Neighbors.slice(0, 1).map((n) => n.Id),
    Maturity: entry.expected.maturity,
    Industry: [...new Set([...entry.expected.industriesInclude, ...entry.handoff.industry])].slice(
      0,
      4,
    ),
    Technology: entry.handoff.technology.slice(0, 5),
    Confidence: 0.6,
    Notes: null,
  });

const pdOracle: EntryModelFn<ProblemDiscoveryEntry> = (entry) =>
  Promise.resolve({
    Problem: entry.expected.requiredFacts.join("; ").slice(0, 280),
    Customer: {
      Segment: entry.Candidate.customer.slice(0, 120),
      Role: "lead",
      Industry: entry.expected.customerIndustry,
    },
    PainLevel: entry.expected.painLevelRange[0],
    PainRationale: "As labelled.",
    Confidence: 0.6,
    Notes: null,
  });

const allPresent: FactJudge = ({ Facts }) =>
  Promise.resolve({ Ok: true, Present: Facts.map(() => true) });

const relOracle: EntryModelFn<RelevanceEntry> = (entry) =>
  Promise.resolve({
    IndustryFit: Object.fromEntries(
      TARGET_INDUSTRY_KEYS.map((key) => [
        key,
        key === entry.expected.bestIndustry ? entry.expected.strategicRelevanceRange[0] : 0,
      ]),
    ),
    FocusMatch: Object.fromEntries(TARGET_INDUSTRY_KEYS.map((key) => [key, "none"])),
    TechnicalFeasibility: entry.expected.technicalFeasibilityRange[0],
    ImplementationEffort: entry.expected.implementationEffort,
    Constraints: [],
    Confidence: 0.6,
    Notes: null,
  });

describe("REQ-TEST-005: the analysis golden sets load with their frozen inputs", () => {
  it("REQ-TEST-005: each set holds at least 20 entries and every entry resolves its candidate and inputs", () => {
    for (const set of [ra, pd, rel]) {
      expect(set.length).toBeGreaterThanOrEqual(20);
    }
    expect(ra.every((e) => e.Neighbors.length > 0 && e.Candidate.finding.length > 0)).toBe(true);
    expect(pd.every((e) => e.ResearchAnalyst.technology.length > 0)).toBe(true);
    expect(rel.every((e) => e.ProblemDiscovery.requiredFacts.length > 0)).toBe(true);
  });

  it("REQ-TEST-005: the thresholds are entry pass rates of 0.75, 0.75, and 0.85 with a tolerance of 0.05", () => {
    expect(loadAnalysisThreshold("research-analyst")).toEqual({
      metric: "entry-pass-rate",
      minimum: 0.75,
      tolerance: 0.05,
    });
    expect(loadAnalysisThreshold("problem-discovery")).toEqual({
      metric: "entry-pass-rate",
      minimum: 0.75,
      tolerance: 0.05,
    });
    expect(loadAnalysisThreshold("relevance")).toEqual({
      metric: "entry-pass-rate",
      minimum: 0.85,
      tolerance: 0.05,
    });
  });
});

describe("REQ-AGENT-001: the Research Analyst eval", () => {
  const threshold = loadAnalysisThreshold("research-analyst");

  it("REQ-AGENT-001: a model that answers as labelled passes every entry", async () => {
    const report = await runResearchAnalystEval(ra, raOracle, threshold);
    expect(report.Entries.filter((e) => !e.Passed)).toEqual([]);
    expect(report.Passed).toBe(true);
  });

  it("REQ-AGENT-008: a related publication that was not given fails the evidence check", async () => {
    const invented: EntryModelFn<ResearchAnalystEntry> = async (entry) => ({
      ...((await raOracle(entry)) as object),
      RelatedPublicationIds: ["http://arxiv.org/abs/0000.00000v1"],
    });
    const report = await runResearchAnalystEval(ra.slice(0, 2), invented, threshold);
    expect(report.Entries.map((e) => e.Failures)).toEqual([
      ["evidence:RelatedPublicationIds"],
      ["evidence:RelatedPublicationIds"],
    ]);
  });

  it("REQ-AGENT-001: novelty out of range, another maturity, and a missing industry each fail", async () => {
    const entry = ra[0]!;
    const wrong: EntryModelFn<ResearchAnalystEntry> = async (e) => ({
      ...((await raOracle(e)) as object),
      Novelty: entry.expected.noveltyRange[1] + 1,
      Maturity: entry.expected.maturity === "theoretical" ? "prototype" : "theoretical",
      Industry: ["other"],
    });
    const report = await runResearchAnalystEval([entry], wrong, threshold);
    expect(report.Entries[0]?.Failures).toEqual(["novelty", "maturity", "industries"]);
  });
});

describe("REQ-AGENT-002: the Problem Discovery eval", () => {
  const threshold = loadAnalysisThreshold("problem-discovery");

  it("REQ-AGENT-002: a labelled answer with every fact present passes every entry", async () => {
    const report = await runProblemDiscoveryEval(pd, pdOracle, allPresent, threshold, true);
    expect(report.Entries.filter((e) => !e.Passed)).toEqual([]);
    expect(report.FactsPresent).toBe(report.FactsJudged);
    expect(report.JudgeErrors).toBe(0);
  });

  it("REQ-AGENT-002: a fact the judge finds absent, and a judge error, fail the entry", async () => {
    const firstAbsent: FactJudge = ({ Facts }) =>
      Promise.resolve({ Ok: true, Present: Facts.map((_, i) => i !== 0) });
    const broken: FactJudge = () => Promise.resolve({ Ok: false, Error: "refusal" });
    const one = pd.slice(0, 1);
    expect(
      (await runProblemDiscoveryEval(one, pdOracle, firstAbsent, threshold, true)).Entries[0]
        ?.Failures,
    ).toEqual(["fact:0"]);
    const errored = await runProblemDiscoveryEval(one, pdOracle, broken, threshold, true);
    expect(errored.Entries[0]?.Failures).toEqual(["judge-error"]);
    expect(errored.JudgeErrors).toBe(1);
  });

  it("REQ-TEST-005: until the judge is calibrated, absent facts and judge errors are listed but do not fail the entry (ADR 0095)", async () => {
    expect(FACTS_GATE).toBe(false);
    const firstAbsent: FactJudge = ({ Facts }) =>
      Promise.resolve({ Ok: true, Present: Facts.map((_, i) => i !== 0) });
    const broken: FactJudge = () => Promise.resolve({ Ok: false, Error: "refusal" });
    const one = pd.slice(0, 1);
    const absent = await runProblemDiscoveryEval(one, pdOracle, firstAbsent, threshold);
    expect(absent.Entries[0]).toMatchObject({ Passed: true, Failures: ["fact:0"] });
    expect(absent.FactsPresent).toBe(absent.FactsJudged - 1);
    const errored = await runProblemDiscoveryEval(one, pdOracle, broken, threshold);
    expect(errored.Entries[0]).toMatchObject({ Passed: true, Failures: ["judge-error"] });
    const wrongIndustry: EntryModelFn<ProblemDiscoveryEntry> = async (e) => {
      const out = (await pdOracle(e)) as { Customer: Record<string, string> };
      return {
        ...out,
        Customer: {
          ...out.Customer,
          Industry: e.expected.customerIndustry === "banking" ? "insurance" : "banking",
        },
      };
    };
    const coded = await runProblemDiscoveryEval(one, wrongIndustry, allPresent, threshold);
    expect(coded.Entries[0]).toMatchObject({ Passed: false, Failures: ["customer-industry"] });
  });

  it("REQ-AGENT-002: the judge is not called for an output that fails the schema", async () => {
    let calls = 0;
    const counting: FactJudge = (input) => {
      calls += 1;
      return allPresent(input);
    };
    const prose: EntryModelFn<ProblemDiscoveryEntry> = () => Promise.resolve("A big problem.");
    const report = await runProblemDiscoveryEval(pd.slice(0, 2), prose, counting, threshold);
    expect(report.Entries.map((e) => e.Failures)).toEqual([["schema"], ["schema"]]);
    expect(calls).toBe(0);
  });
});

describe("REQ-AGENT-006: the Relevance eval", () => {
  const threshold = loadAnalysisThreshold("relevance");

  it("REQ-AGENT-006: a labelled answer passes every entry", async () => {
    const report = await runRelevanceEval(rel, relOracle, threshold);
    expect(report.Entries.filter((e) => !e.Passed)).toEqual([]);
  });

  it("REQ-AGENT-006: the computed score, not a model field, is checked against the range", async () => {
    const entry = rel[0]!;
    const [, high] = entry.expected.strategicRelevanceRange;
    // A clear focus match raises the best fit by 10 and pushes the computed score past the range.
    const raised: EntryModelFn<RelevanceEntry> = async (e) => {
      const out = (await relOracle(e)) as {
        IndustryFit: Record<string, number>;
        FocusMatch: Record<string, string>;
      };
      return {
        ...out,
        IndustryFit: { ...out.IndustryFit, [e.expected.bestIndustry]: high },
        FocusMatch: { ...out.FocusMatch, [e.expected.bestIndustry]: "clear" },
      };
    };
    const report = await runRelevanceEval([entry], raised, threshold);
    expect(report.Entries[0]?.Failures).toEqual(
      Math.min(100, high + 10) > high ? ["strategic-relevance"] : [],
    );
  });

  it("REQ-AGENT-006: effort passes one level from the label and fails two levels away (ADR 0103)", () => {
    expect(effortWithinOneLevel("M", "L")).toBe(true);
    expect(effortWithinOneLevel("XL", "L")).toBe(true);
    expect(effortWithinOneLevel("S", "S")).toBe(true);
    expect(effortWithinOneLevel("S", "L")).toBe(false);
    expect(effortWithinOneLevel("XL", "M")).toBe(false);
  });

  it("REQ-AGENT-006: another best industry, feasibility out of range, and another effort each fail", async () => {
    // An entry whose range stops below 100, so a fit of 100 for another industry falls outside it.
    const entry = rel.find((e) => e.expected.strategicRelevanceRange[1] < 100)!;
    const other = TARGET_INDUSTRY_KEYS.find((k) => k !== entry.expected.bestIndustry)!;
    const wrong: EntryModelFn<RelevanceEntry> = async (e) => {
      const out = (await relOracle(e)) as { IndustryFit: Record<string, number> };
      return {
        ...out,
        IndustryFit: { ...out.IndustryFit, [other]: 100 },
        TechnicalFeasibility: e.expected.technicalFeasibilityRange[1] + 1,
        // Two or more levels away, so the one-level tolerance of ADR 0103 does not apply.
        ImplementationEffort: ["S", "M"].includes(e.expected.implementationEffort) ? "XL" : "S",
      };
    };
    const report = await runRelevanceEval([entry], wrong, threshold);
    expect(report.Entries[0]?.Failures).toEqual([
      "best-industry",
      "strategic-relevance",
      "technical-feasibility",
      "implementation-effort",
    ]);
  });
});
