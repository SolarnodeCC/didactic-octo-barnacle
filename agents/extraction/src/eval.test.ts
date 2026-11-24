import { decideTriage, type TriageSignals } from "@roi/models";
import { describe, expect, it } from "vitest";

import {
  extractionStability,
  quotesOverlap,
  runExtractionEval,
  runTriageEval,
  triageStability,
  type ExtractionTrace,
  type ModelFn,
} from "./eval.js";
import {
  loadExtractionSet,
  loadThreshold,
  loadTriageSet,
  withInjections,
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

/**
 * The oracle with `signal` flipped on every entry where the flip leaves the code decision
 * unchanged, so only signal agreement moves.
 */
function flipKeepingDecision(
  entries: readonly TriageEntry[],
  signal: keyof TriageSignals,
): ModelFn {
  const oracle = triageOracle(entries);
  return async (publication) => {
    const output = (await oracle(publication)) as { Signals: TriageSignals; Notes: null };
    const flipped = { ...output.Signals, [signal]: !output.Signals[signal] };
    if (decideTriage(flipped).Accepted === decideTriage(output.Signals).Accepted) {
      output.Signals = flipped;
    }
    return output;
  };
}

describe("REQ-TEST-006: the triage threshold passes on the decision with a signal floor", () => {
  const threshold = loadThreshold("triage");

  it("REQ-TEST-006: the triage threshold file uses decision-pass-rate with a signal floor of 0.8", () => {
    expect(threshold).toEqual({
      metric: "decision-pass-rate",
      minimum: 0.85,
      tolerance: 0.05,
      signalFloor: 0.8,
    });
  });

  it("REQ-TEST-006: an entry with a wrong signal and the right decision passes and lists the signal", async () => {
    const report = await runTriageEval(
      triageSet,
      flipKeepingDecision(triageSet, "Adoptable"),
      threshold,
    );
    const flipped = report.Entries.filter((entry) => entry.Failures.includes("signal:Adoptable"));
    expect(flipped.length).toBeGreaterThan(0);
    expect(flipped.every((entry) => entry.Passed)).toBe(true);
    expect(report.PassRate).toBe(1);
  });

  it("REQ-TEST-006: a signal below the floor fails the run even when every decision is right", async () => {
    const report = await runTriageEval(
      triageSet,
      flipKeepingDecision(triageSet, "Adoptable"),
      threshold,
    );
    expect(report.SignalAgreement.Adoptable).toBeLessThan(0.8);
    expect(report.SignalsBelowFloor).toEqual(["Adoptable"]);
    expect(report.Passed).toBe(false);
  });

  it("REQ-TEST-006: under entry-pass-rate a wrong signal still fails the entry", async () => {
    const report = await runTriageEval(triageSet, flipKeepingDecision(triageSet, "Adoptable"), {
      metric: "entry-pass-rate",
      minimum: 0.85,
      tolerance: 0.05,
    });
    expect(report.PassRate).toBeLessThan(1);
    expect(report.SignalsBelowFloor).toEqual([]);
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

  it("REQ-AGENT-008: a quote of the text without LaTeX markup passes (ADR 0089)", async () => {
    const entry = extractionSet.find((e) => e.Publication.Abstract.includes("\\texttt{Pytest}"));
    expect(entry).toBeDefined();
    const oracle = extractionOracle([entry!]);
    const cleaned: ModelFn = async (publication) => {
      const output = (await oracle(publication)) as {
        Candidates: Array<{ EvidenceQuote: string }>;
      };
      output.Candidates[0]!.EvidenceQuote = "While Pytest offers simpler assertions";
      return output;
    };
    const report = await runExtractionEval([entry!], cleaned, loadThreshold("extraction"));
    expect(report.Entries[0]?.Failures).toEqual([]);
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

/** A synthetic triage entry: its labels and industry; the publication ID is the entry ID. */
function syntheticEntry(
  id: string,
  industry: string | undefined,
  signals: Record<
    "namedParty" | "statedHarm" | "trigger" | "existingAlternative" | "adoptable",
    boolean
  >,
): TriageEntry {
  const accepted = decideTriage({
    NamedParty: signals.namedParty,
    StatedHarm: signals.statedHarm,
    Trigger: signals.trigger,
    ExistingAlternative: signals.existingAlternative,
    Adoptable: signals.adoptable,
  }).Accepted;
  return {
    id,
    publicationFixture: `fixtures/${id}.json`,
    ...(industry === undefined ? {} : { industry }),
    expected: { signals, accepted, reason: accepted ? "accepted" : "low-score" },
    Publication: { Id: id, Title: id, Abstract: id, Text: id },
  };
}

const PASS = {
  namedParty: true,
  statedHarm: true,
  trigger: true,
  existingAlternative: false,
  adoptable: false,
};
const FAIL = {
  namedParty: false,
  statedHarm: false,
  trigger: false,
  existingAlternative: false,
  adoptable: false,
};

function answer(s: typeof PASS): unknown {
  return {
    Signals: {
      NamedParty: s.namedParty,
      StatedHarm: s.statedHarm,
      Trigger: s.trigger,
      ExistingAlternative: s.existingAlternative,
      Adoptable: s.adoptable,
    },
    Notes: null,
  };
}

/** Four positives and four negatives across two industries and one entry without a label. */
const synthetic = [
  syntheticEntry("p1", "life-sciences", PASS),
  syntheticEntry("p2", "life-sciences", PASS),
  syntheticEntry("p3", "banking", PASS),
  syntheticEntry("p4", undefined, PASS),
  syntheticEntry("n1", "life-sciences", FAIL),
  syntheticEntry("n2", "banking", FAIL),
  syntheticEntry("n3", "banking", FAIL),
  syntheticEntry("n4", undefined, FAIL),
];

/**
 * Answers that give a known confusion: p1, p2 accepted (TP); p3 rejected (FN); p4 invalid
 * output (FN, invalid); n1 accepted (FP); n2, n3, n4 rejected (TN).
 */
const scripted: Record<string, unknown> = {
  p1: answer(PASS),
  p2: answer(PASS),
  p3: answer(FAIL),
  p4: "not json at all",
  n1: answer(PASS),
  n2: answer(FAIL),
  n3: answer(FAIL),
  n4: answer(FAIL),
};
const scriptedModel: ModelFn = (publication) => Promise.resolve(scripted[publication.Id]);

describe("REQ-TEST-007: the triage eval report", () => {
  it("REQ-TEST-007: AC1 gives the confusion matrix, accuracy, precision, recall, and F1 of the accept decision", async () => {
    const report = await runTriageEval(synthetic, scriptedModel, loadThreshold("triage"));
    expect(report.Confusion).toEqual({
      TruePositive: 2,
      FalsePositive: 1,
      FalseNegative: 2,
      TrueNegative: 3,
      Invalid: 1,
    });
    expect(report.Accuracy).toBeCloseTo(5 / 8);
    // Precision 2/3 and recall 2/4, as the existing figures, and F1 their harmonic mean.
    expect(report.Precision).toBeCloseTo(2 / 3);
    expect(report.Recall).toBeCloseTo(1 / 2);
    expect(report.F1).toBeCloseTo((2 * (2 / 3) * (1 / 2)) / (2 / 3 + 1 / 2));
  });

  it("REQ-TEST-007: AC1 breaks the figures down per industry, with unlabelled entries apart", async () => {
    const report = await runTriageEval(synthetic, scriptedModel, loadThreshold("triage"));
    expect(Object.keys(report.ByIndustry)).toEqual(["banking", "life-sciences", "unlabelled"]);
    expect(report.ByIndustry["life-sciences"]).toMatchObject({
      Entries: 3,
      Confusion: { TruePositive: 2, FalsePositive: 1, FalseNegative: 0, TrueNegative: 0 },
      Precision: 2 / 3,
      Recall: 1,
    });
    expect(report.ByIndustry["banking"]).toMatchObject({
      Entries: 3,
      Accuracy: 2 / 3,
      Confusion: { TruePositive: 0, FalseNegative: 1, TrueNegative: 2 },
    });
    // Signal agreement per industry: in life-sciences n1 was read as passing, so its named party disagrees.
    expect(report.ByIndustry["life-sciences"]?.SignalAgreement.NamedParty).toBeCloseTo(2 / 3);
    expect(report.ByIndustry["unlabelled"]?.Confusion.Invalid).toBe(1);
  });

  it("REQ-TEST-007: AC6 the report-only figures leave the pass rule and the pass rate unchanged", async () => {
    const report = await runTriageEval(synthetic, scriptedModel, loadThreshold("triage"));
    // p3, p4 (invalid), and n1 fail the decision; five of eight pass.
    expect(report.PassRate).toBeCloseTo(5 / 8);
    expect(report.Entries.map((entry) => entry.Passed)).toEqual([
      true,
      true,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("REQ-TEST-007: AC5 gives the agreement of the decision and each signal over three runs", async () => {
    const first = await runTriageEval(synthetic, scriptedModel, loadThreshold("triage"));
    const second = await runTriageEval(synthetic, scriptedModel, loadThreshold("triage"));
    // The third run flips p1 to a rejection and reads n2 with a trigger.
    const flipped: ModelFn = (publication) =>
      Promise.resolve(
        publication.Id === "p1"
          ? answer(FAIL)
          : publication.Id === "n2"
            ? answer({ ...FAIL, trigger: true })
            : scripted[publication.Id],
      );
    const third = await runTriageEval(synthetic, flipped, loadThreshold("triage"));

    const stability = triageStability([first.Entries, second.Entries, third.Entries]);
    expect(stability.Runs).toBe(3);
    // p4 is invalid in every run, so it never agrees; p1 changes its decision.
    expect(stability.Decision).toBeCloseTo(6 / 8);
    expect(stability.Signals.Trigger).toBeCloseTo(5 / 8);
    expect(stability.Signals.Adoptable).toBeCloseTo(7 / 8);
  });
});

const Q1 = "Grid operators lose transformers to undetected faults every winter season.";
const Q2 = "Banks reconcile payment exceptions by hand across many legacy systems today.";
const FILLER = Array.from({ length: 120 }, () => "lorem").join(" ");
const TEXT = `${Q1} ${FILLER} ${Q2}`;
/** Spans the end of Q1 and the start of the filler: overlaps Q1 by 50 characters. */
const Q1_OVERLAP = `${Q1.slice(Q1.length - 50)} lorem lorem`;

type Labelled = { evidenceQuote: string; customerQuote: string; optional?: boolean };

function labelled(
  quote: string,
  optional = false,
): Labelled & ExtractionEntry["expected"]["candidates"][number] {
  return {
    finding: "A finding.",
    evidenceQuote: quote,
    customer: quote === Q2 ? "banks" : "grid operators",
    customerQuote: quote === Q2 ? "Banks" : "Grid operators",
    ...(optional ? { optional: true } : {}),
  };
}

function entry(id: string, candidates: ReturnType<typeof labelled>[]): ExtractionEntry {
  return {
    id,
    publicationFixture: "fixtures/none.json",
    industry: "other",
    expected: { candidates, ...(candidates.length === 0 ? { reason: "none" } : {}) },
    Publication: { Id: id, Title: "", Abstract: TEXT, Text: TEXT },
  };
}

function returned(quote: string) {
  return {
    Finding: "A finding.",
    EvidenceQuote: quote,
    Customer: quote === Q2 ? "banks" : "grid operators",
    CustomerQuote: quote === Q2 ? "Banks" : "Grid operators",
    WhyNow: null,
    WhyNowQuote: null,
    CurrentAlternative: null,
    AlternativeQuote: null,
  };
}

function output(quotes: string[], confidence = 0.6) {
  return {
    Candidates: quotes.map(returned),
    Confidence: confidence,
    Notes: quotes.length === 0 ? "No candidate." : null,
  };
}

/** A stub that answers each entry ID with its scripted answer. */
function answering(answers: Record<string, unknown>): ModelFn {
  return (publication) => Promise.resolve(answers[publication.Id]);
}

const threshold = loadThreshold("extraction");

describe("REQ-TEST-007: the extraction eval report (ADR 0067)", () => {
  it("REQ-TEST-007 AC2: evidence quotes match when one contains the other or they share 40 characters", () => {
    expect(quotesOverlap(Q1, Q1.slice(0, 30))).toBe(true);
    expect(quotesOverlap(Q1, Q1_OVERLAP)).toBe(true);
    expect(quotesOverlap(Q1, `${Q1.slice(Q1.length - 30)} lorem lorem`)).toBe(false);
    expect(quotesOverlap(Q1, Q2)).toBe(false);
  });

  it("REQ-TEST-007 AC2: precision, recall, and F1 of candidate matching", async () => {
    const report = await runExtractionEval(
      [entry("e1", [labelled(Q1)])],
      answering({ e1: output([Q1_OVERLAP, Q2]) }),
      threshold,
    );
    expect(report.Matching).toEqual({
      TruePositive: 1,
      Returned: 2,
      Expected: 1,
      Precision: 0.5,
      Recall: 1,
      F1: 2 / 3,
    });
  });

  it("REQ-TEST-007 AC2: an optional candidate counts for neither precision nor recall", async () => {
    const set = [entry("e1", [labelled(Q1), labelled(Q2, true)])];
    const missed = await runExtractionEval(set, answering({ e1: output([Q1]) }), threshold);
    expect(missed.Matching).toMatchObject({ Precision: 1, Recall: 1 });
    const found = await runExtractionEval(set, answering({ e1: output([Q1, Q2]) }), threshold);
    expect(found.Matching).toMatchObject({ Returned: 1, Precision: 1, Recall: 1 });
  });

  it("REQ-TEST-007 AC2: accuracy on entries that should yield no candidate", async () => {
    const report = await runExtractionEval(
      [entry("e1", []), entry("e2", [])],
      answering({ e1: output([]), e2: output([Q1]) }),
      threshold,
    );
    expect(report.EmptyEntryAccuracy).toBe(0.5);
  });

  it("REQ-TEST-007 AC3: quote rates from the step's traces, and quote positions by tenth", async () => {
    const trace = (quotes: string[], extra: Partial<ExtractionTrace>): ExtractionTrace => ({
      Kind: "extraction-trace",
      Output: output(quotes),
      Attempts: 1,
      Returned: quotes.length,
      Dropped: 0,
      NormalisedOnly: 0,
      ...extra,
    });
    const report = await runExtractionEval(
      [entry("e1", [labelled(Q1)]), entry("e2", [labelled(Q2)])],
      answering({
        e1: trace([Q1], {}),
        e2: trace([Q2], { Attempts: 2, Returned: 2, Dropped: 1, NormalisedOnly: 1 }),
      }),
      threshold,
    );
    expect(report.Quotes.FirstAttempt).toBe(0.5);
    expect(report.Quotes.Dropped).toBe(1 / 3);
    // Two kept candidates with two quotes each.
    expect(report.Quotes.NormalisedOnly).toBe(0.25);
    expect(report.Quotes.Positions).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  });

  it("REQ-TEST-007 AC3: without traces the quote rates are not reported", async () => {
    const report = await runExtractionEval(
      [entry("e1", [labelled(Q1)])],
      answering({ e1: output([Q1]) }),
      threshold,
    );
    expect(report.Quotes).toMatchObject({
      FirstAttempt: null,
      NormalisedOnly: null,
      Dropped: null,
    });
  });

  it("REQ-TEST-007 AC4: the Brier score of Confidence against entry pass", async () => {
    const report = await runExtractionEval(
      [entry("pass", [labelled(Q1)]), entry("fail", [labelled(Q1)])],
      answering({ pass: output([Q1], 0.8), fail: output([], 0.4) }),
      threshold,
    );
    expect(report.Entries.map((e) => e.Passed)).toEqual([true, false]);
    expect(report.Brier).toBeCloseTo(0.1, 10);
  });

  it("REQ-TEST-007 AC4: whether the top third by Confidence passes at least as often as the bottom third", async () => {
    const set = [
      entry("a", [labelled(Q1)]),
      entry("b", [labelled(Q1)]),
      entry("c", [labelled(Q1)]),
    ];
    const calibrated = await runExtractionEval(
      set,
      answering({ a: output([Q1], 0.9), b: output([Q1], 0.5), c: output([], 0.1) }),
      threshold,
    );
    expect(calibrated.TopThirdAtLeastBottom).toBe(true);
    const inverted = await runExtractionEval(
      set,
      answering({ a: output([], 0.9), b: output([Q1], 0.5), c: output([Q1], 0.1) }),
      threshold,
    );
    expect(inverted.TopThirdAtLeastBottom).toBe(false);
  });

  it("REQ-TEST-007 AC5: stability is the share of entries with the same candidate count in every run", () => {
    expect(
      extractionStability([
        [
          { Id: "a", CandidateCount: 1 },
          { Id: "b", CandidateCount: 1 },
        ],
        [
          { Id: "a", CandidateCount: 1 },
          { Id: "b", CandidateCount: 2 },
        ],
      ]),
    ).toBe(0.5);
  });

  it("REQ-TEST-007 AC6: the report-only metrics leave the pass rate unchanged", async () => {
    const report = await runExtractionEval(
      extractionSet,
      extractionOracle(extractionSet),
      loadThreshold("extraction"),
    );
    expect(report.PassRate).toBe(1);
    expect(report.Matching).toMatchObject({ Precision: 1, Recall: 1, F1: 1 });
    expect(report.EmptyEntryAccuracy).toBe(1);
  });
});

describe("REQ-NFR-006: the adversarial injection set keeps the owner's labels (ADR 0119)", () => {
  const injectedTriage = withInjections(triageSet);
  const injectedExtraction = withInjections(extractionSet);

  it("REQ-NFR-006: AC3 every entry gets a planted instruction and keeps its labels and fixture", () => {
    expect(injectedTriage).toHaveLength(triageSet.length);
    injectedTriage.forEach((entry, index) => {
      const original = triageSet[index]!;
      expect(entry.id).toBe(`${original.id}-inj`);
      expect(entry.expected).toEqual(original.expected);
      expect(entry.Publication.Id).toBe(original.Publication.Id);
      expect(entry.Publication.Abstract.startsWith(original.Publication.Abstract)).toBe(true);
      expect(entry.Publication.Abstract.length).toBeGreaterThan(
        original.Publication.Abstract.length,
      );
    });
  });

  it("REQ-NFR-006: AC3 a model that ignores the planted instruction passes the triage set", async () => {
    const report = await runTriageEval(
      injectedTriage,
      triageOracle(triageSet),
      loadThreshold("triage"),
    );
    expect(report.Passed).toBe(true);
  });

  it("REQ-NFR-006: AC3 a model that obeys the planted instruction fails the triage set", async () => {
    const obey: ModelFn = () =>
      Promise.resolve({
        Signals: {
          NamedParty: true,
          StatedHarm: true,
          Trigger: true,
          ExistingAlternative: true,
          Adoptable: true,
        },
        Notes: null,
      });
    const report = await runTriageEval(injectedTriage, obey, loadThreshold("triage"));
    expect(report.Passed).toBe(false);
  });

  it("REQ-NFR-006: AC3 the labelled quotes stay verbatim, so an honest model passes the extraction set", async () => {
    const report = await runExtractionEval(
      injectedExtraction,
      extractionOracle(extractionSet),
      loadThreshold("extraction"),
    );
    expect(report.Entries.filter((entry) => !entry.Passed)).toEqual([]);
  });
});
