import {
  cleanLatexMarkup,
  decideTriage,
  extractionMissingQuotes,
  extractionOutputSchema,
  normalizeForQuote,
  repairModelOutput,
  TriageModelOutputSchema,
  type RepairKind,
  type TriageSignals,
} from "@roi/models";

import {
  type ExtractionEntry,
  type Publication,
  type Threshold,
  type TriageEntry,
} from "./golden-set.js";

/**
 * A step under evaluation: publication in, raw model output out. The provider, the prompt,
 * and AI Gateway sit behind it (OQ-036 chooses the model); tests pass stubs.
 */
export type ModelFn = (publication: Publication) => Promise<unknown>;

export type EntryResult = {
  Id: string;
  Passed: boolean;
  /** The checks of docs/kt/test/ai-evals.md that failed, empty when the entry passed. */
  Failures: string[];
  Repairs: RepairKind[];
};

export type EvalReport = {
  Entries: EntryResult[];
  PassRate: number;
  Threshold: Threshold;
  /** Below `minimum - tolerance` fails the run (REQ-TEST-004). */
  Passed: boolean;
};

export function report(entries: EntryResult[], threshold: Threshold): EvalReport {
  const passRate =
    entries.length === 0 ? 0 : entries.filter((e) => e.Passed).length / entries.length;
  return {
    Entries: entries,
    PassRate: passRate,
    Threshold: threshold,
    Passed: passRate >= threshold.minimum - threshold.tolerance,
  };
}

const SIGNALS: ReadonlyArray<[keyof TriageSignals, keyof TriageEntry["expected"]["signals"]]> = [
  ["NamedParty", "namedParty"],
  ["StatedHarm", "statedHarm"],
  ["Trigger", "trigger"],
  ["ExistingAlternative", "existingAlternative"],
  ["Adoptable", "adoptable"],
];

/** What the model returned for one entry: its signals and the decision code derives, or null for invalid output. */
export type TriagePrediction = { Accepted: boolean; Signals: TriageSignals } | null;

export type TriageEntryResult = EntryResult & {
  /** The entry's `industry` label, or null while it has none. */
  Industry: string | null;
  Predicted: TriagePrediction;
};

/**
 * The accept decision against the labels (REQ-TEST-007 AC1). An invalid output counts as a
 * missed accept on a positive entry and as a correct reject on a negative one, as before, and
 * is also counted on its own.
 */
export type TriageConfusion = {
  TruePositive: number;
  FalsePositive: number;
  FalseNegative: number;
  TrueNegative: number;
  Invalid: number;
};

/** Report-only figures of a group of entries (REQ-TEST-007 AC1, AC6). */
export type TriageMetrics = {
  Entries: number;
  Confusion: TriageConfusion;
  Accuracy: number;
  Precision: number;
  Recall: number;
  F1: number;
  SignalAgreement: Record<keyof TriageSignals, number>;
};

export type TriageEvalReport = Omit<EvalReport, "Entries"> & {
  Entries: TriageEntryResult[];
  /** Share of entries on which the model read each signal as labelled. */
  SignalAgreement: Record<keyof TriageSignals, number>;
  /** Signals whose agreement is below the threshold's `signalFloor`; these fail the run (ADR 0087). */
  SignalsBelowFloor: Array<keyof TriageSignals>;
  Precision: number;
  Recall: number;
  /** Report-only (REQ-TEST-007 AC6): the pass rule and thresholds do not use them. */
  Confusion: TriageConfusion;
  Accuracy: number;
  F1: number;
  /** The same figures per `industry` label; entries without one are under `unlabelled`. */
  ByIndustry: Record<string, TriageMetrics>;
};

type Labelled = {
  Expected: boolean;
  Labels: TriageEntry["expected"]["signals"];
  Predicted: TriagePrediction;
};

/** The report-only metrics of a group of entries (REQ-TEST-007 AC1). */
export function triageMetrics(group: readonly Labelled[]): TriageMetrics {
  const confusion: TriageConfusion = {
    TruePositive: 0,
    FalsePositive: 0,
    FalseNegative: 0,
    TrueNegative: 0,
    Invalid: 0,
  };
  const agree = Object.fromEntries(SIGNALS.map(([name]) => [name, 0])) as Record<
    keyof TriageSignals,
    number
  >;
  for (const item of group) {
    const accepted = item.Predicted?.Accepted ?? false;
    if (item.Predicted === null) {
      confusion.Invalid += 1;
    } else {
      for (const [name, label] of SIGNALS) {
        if (item.Predicted.Signals[name] === item.Labels[label]) {
          agree[name] += 1;
        }
      }
    }
    if (item.Expected) {
      confusion[accepted ? "TruePositive" : "FalseNegative"] += 1;
    } else {
      confusion[accepted ? "FalsePositive" : "TrueNegative"] += 1;
    }
  }
  const n = group.length;
  const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);
  const precision = ratio(confusion.TruePositive, confusion.TruePositive + confusion.FalsePositive);
  const recall = ratio(confusion.TruePositive, confusion.TruePositive + confusion.FalseNegative);
  return {
    Entries: n,
    Confusion: confusion,
    Accuracy: ratio(confusion.TruePositive + confusion.TrueNegative, n),
    Precision: precision,
    Recall: recall,
    F1: ratio(2 * precision * recall, precision + recall),
    SignalAgreement: Object.fromEntries(
      Object.entries(agree).map(([name, count]) => [name, ratio(count, n)]),
    ) as Record<keyof TriageSignals, number>,
  };
}

/** Agreement of three or more runs on the same entries (REQ-TEST-007 AC5), report-only. */
export type TriageStability = {
  Runs: number;
  /** Share of entries whose accept decision was the same in every run. */
  Decision: number;
  /** Share of entries whose signal was the same in every run, per signal. */
  Signals: Record<keyof TriageSignals, number>;
};

/**
 * How stable the decision and the signals are over repeated runs (REQ-TEST-007 AC5). An entry
 * agrees when every run gave the same value; an invalid output in any run counts as a
 * disagreement.
 */
export function triageStability(
  runs: ReadonlyArray<ReadonlyArray<{ Id: string; Predicted: TriagePrediction }>>,
): TriageStability {
  const ids = runs[0]?.map((entry) => entry.Id) ?? [];
  const byRun = runs.map((run) => new Map(run.map((entry) => [entry.Id, entry.Predicted])));
  let decision = 0;
  const signals = Object.fromEntries(SIGNALS.map(([name]) => [name, 0])) as Record<
    keyof TriageSignals,
    number
  >;
  for (const id of ids) {
    const predictions = byRun.map((run) => run.get(id) ?? null);
    const first = predictions[0];
    if (!first || predictions.some((p) => p === null)) {
      continue;
    }
    const valid = predictions as Array<NonNullable<TriagePrediction>>;
    if (valid.every((p) => p.Accepted === first.Accepted)) {
      decision += 1;
    }
    for (const [name] of SIGNALS) {
      if (valid.every((p) => p.Signals[name] === first.Signals[name])) {
        signals[name] += 1;
      }
    }
  }
  const n = Math.max(ids.length, 1);
  return {
    Runs: runs.length,
    Decision: decision / n,
    Signals: Object.fromEntries(
      Object.entries(signals).map(([name, count]) => [name, count / n]),
    ) as Record<keyof TriageSignals, number>,
  };
}

/**
 * Triage eval (REQ-PROC-008, docs/kt/agents/triage.md). Under `decision-pass-rate`
 * (ADR 0087) an entry passes when the output matches the schema and the decision that code
 * derives from its signals is the labelled one; the run passes when that share meets the
 * threshold and every signal agrees with the labels on at least `signalFloor` of the entries.
 * Under `entry-pass-rate` an entry also needs every signal to agree. Signal mismatches are
 * listed as failures either way.
 */
export async function runTriageEval(
  entries: readonly TriageEntry[],
  model: ModelFn,
  threshold: Threshold,
): Promise<TriageEvalReport> {
  const results: TriageEntryResult[] = [];
  const labelled: Array<Labelled & { Industry: string | null }> = [];
  const agree = Object.fromEntries(SIGNALS.map(([name]) => [name, 0])) as Record<
    keyof TriageSignals,
    number
  >;
  let truePositive = 0;
  let predicted = 0;
  let actual = 0;
  for (const entry of entries) {
    const failures: string[] = [];
    const repaired = repairModelOutput(await model(entry.Publication), TriageModelOutputSchema);
    const parsed = repaired.Ok ? TriageModelOutputSchema.safeParse(repaired.Value) : null;
    if (entry.expected.accepted) {
      actual += 1;
    }
    let prediction: TriagePrediction = null;
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      for (const [name, label] of SIGNALS) {
        if (parsed.data.Signals[name] === entry.expected.signals[label]) {
          agree[name] += 1;
        } else {
          failures.push(`signal:${name}`);
        }
      }
      const decision = decideTriage(parsed.data.Signals);
      prediction = { Accepted: decision.Accepted, Signals: parsed.data.Signals };
      if (decision.Accepted) {
        predicted += 1;
        truePositive += entry.expected.accepted ? 1 : 0;
      }
      if (decision.Accepted !== entry.expected.accepted) {
        failures.push("decision");
      }
    }
    const blocking =
      threshold.metric === "decision-pass-rate"
        ? failures.filter((failure) => !failure.startsWith("signal:"))
        : failures;
    const industry = entry.industry ?? null;
    results.push({
      Id: entry.id,
      Passed: blocking.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
      Industry: industry,
      Predicted: prediction,
    });
    labelled.push({
      Expected: entry.expected.accepted,
      Labels: entry.expected.signals,
      Predicted: prediction,
      Industry: industry,
    });
  }
  const n = Math.max(entries.length, 1);
  const signalAgreement = Object.fromEntries(
    Object.entries(agree).map(([name, count]) => [name, count / n]),
  ) as Record<keyof TriageSignals, number>;
  const belowFloor =
    threshold.metric === "decision-pass-rate"
      ? SIGNALS.map(([name]) => name).filter(
          (name) => signalAgreement[name] < threshold.signalFloor,
        )
      : [];
  const base = report(results, threshold);
  const overall = triageMetrics(labelled);
  const groups = new Map<string, Labelled[]>();
  for (const item of labelled) {
    const key = item.Industry ?? "unlabelled";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return {
    ...base,
    Entries: results,
    Passed: base.Passed && belowFloor.length === 0,
    SignalAgreement: signalAgreement,
    SignalsBelowFloor: belowFloor,
    Precision: predicted === 0 ? 0 : truePositive / predicted,
    Recall: actual === 0 ? 0 : truePositive / actual,
    Confusion: overall.Confusion,
    Accuracy: overall.Accuracy,
    F1: overall.F1,
    ByIndustry: Object.fromEntries(
      [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, group]) => [key, triageMetrics(group)]),
    ),
  };
}

/**
 * What `extractionModelFn` returns: the kept output with how it was reached, so the report can
 * give the quote rates of ADR 0064 (REQ-TEST-007 AC3). A stub that returns a plain output
 * still works; its entries count for the rates that need no trace.
 */
export type ExtractionTrace = {
  Kind: "extraction-trace";
  /** The output after the candidate checks: failing candidates dropped, quotes as source spans. */
  Output: unknown;
  /** Attempts the step used; 0 when the budget refused it. */
  Attempts: number;
  /** Candidates the accepted attempt returned, before any was dropped. */
  Returned: number;
  /** Candidates dropped on the last attempt (ADR 0064). */
  Dropped: number;
  /** Kept quotes that match only after normalisation, not as a plain substring. */
  NormalisedOnly: number;
};

function isTrace(value: unknown): value is ExtractionTrace {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { Kind?: unknown }).Kind === "extraction-trace"
  );
}

/** Two evidence quotes match when their normalised forms share at least this many characters. */
export const QUOTE_OVERLAP_MIN_CHARS = 40;

function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = (previous[j - 1] ?? 0) + 1;
        best = Math.max(best, current[j] ?? 0);
      }
    }
    previous = current;
  }
  return best;
}

/**
 * Whether an expected and a returned evidence quote are the same evidence (ADR 0067): after
 * normalisation one contains the other, or they share `QUOTE_OVERLAP_MIN_CHARS` characters.
 */
export function quotesOverlap(expected: string, returned: string): boolean {
  const a = normalizeForQuote(expected);
  const b = normalizeForQuote(returned);
  if (a === "" || b === "") {
    return false;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  return longestCommonSubstring(a, b) >= QUOTE_OVERLAP_MIN_CHARS;
}

export type ExtractionEntryResult = EntryResult & {
  /** Candidates in the valid output, or null for invalid output. */
  CandidateCount: number | null;
  Confidence: number | null;
};

/** Candidate matching over all entries (REQ-TEST-007 AC2). */
export type ExtractionMatching = {
  /** Returned candidates matched to an expected candidate that is not `optional`. */
  TruePositive: number;
  /** Returned candidates, those matched to an `optional` one left out. */
  Returned: number;
  /** Expected candidates that are not `optional`. */
  Expected: number;
  Precision: number;
  Recall: number;
  F1: number;
};

export type ExtractionEvalReport = Omit<EvalReport, "Entries"> & {
  Entries: ExtractionEntryResult[];
  /** Report-only (REQ-TEST-007 AC6): the pass rule and threshold do not use these. */
  Matching: ExtractionMatching;
  /** Share of entries that should yield no candidate and returned a valid empty list. */
  EmptyEntryAccuracy: number | null;
  /** Quote rates and positions (REQ-TEST-007 AC3, ADR 0064, ADR 0065). */
  Quotes: {
    /** Share of traced entries accepted on the first attempt with nothing dropped. */
    FirstAttempt: number | null;
    /** Share of kept quotes that match only after normalisation. */
    NormalisedOnly: number | null;
    /** Share of returned candidates dropped on the last attempt. */
    Dropped: number | null;
    /** Kept quotes by tenth of the input text where they start, first tenth first. */
    Positions: number[];
  };
  /** Mean of (Confidence - pass)^2 over entries with valid output (REQ-TEST-007 AC4). */
  Brier: number | null;
  /** Whether the top third by Confidence passes at least as often as the bottom third. */
  TopThirdAtLeastBottom: boolean | null;
};

type MatchCount = { TruePositive: number; Returned: number; Expected: number };

/** Greedy one-to-one matching, in list order, of returned to expected candidates. */
function matchCandidates(
  expected: ReadonlyArray<{ evidenceQuote: string; optional?: boolean | undefined }>,
  returned: ReadonlyArray<{ EvidenceQuote: string }>,
): MatchCount {
  const used = new Set<number>();
  let truePositive = 0;
  let matchedOptional = 0;
  for (const candidate of returned) {
    const index = expected.findIndex(
      (item, i) => !used.has(i) && quotesOverlap(item.evidenceQuote, candidate.EvidenceQuote),
    );
    if (index === -1) {
      continue;
    }
    used.add(index);
    if (expected[index]?.optional === true) {
      matchedOptional += 1;
    } else {
      truePositive += 1;
    }
  }
  return {
    TruePositive: truePositive,
    Returned: returned.length - matchedOptional,
    Expected: expected.filter((item) => item.optional !== true).length,
  };
}

const QUOTE_FIELDS = ["EvidenceQuote", "CustomerQuote", "WhyNowQuote", "AlternativeQuote"] as const;

/**
 * Extraction eval (REQ-PROC-009). The pass rule is unchanged: schema, quotes that occur in the
 * text after normalisation (REQ-AGENT-008), and the number of candidates. The reference check of
 * `Finding` and `Customer` needs a model judge with a rubric (OQ-020) and is not part of this
 * runner yet. The report adds the report-only metrics of ADR 0067 (REQ-TEST-007 AC2 to AC4).
 */
export async function runExtractionEval(
  entries: readonly ExtractionEntry[],
  model: ModelFn,
  threshold: Threshold,
  maxCandidates?: number,
): Promise<ExtractionEvalReport> {
  const schema = extractionOutputSchema(maxCandidates);
  const results: ExtractionEntryResult[] = [];
  const matching: MatchCount = { TruePositive: 0, Returned: 0, Expected: 0 };
  let emptyEntries = 0;
  let emptyCorrect = 0;
  let traced = 0;
  let firstAttempt = 0;
  let returnedTotal = 0;
  let droppedTotal = 0;
  let normalisedOnly = 0;
  let tracedQuotes = 0;
  const positions = new Array<number>(10).fill(0);

  for (const entry of entries) {
    const failures: string[] = [];
    const answer = await model(entry.Publication);
    const trace = isTrace(answer) ? answer : null;
    const repaired = repairModelOutput(trace ? trace.Output : answer, schema);
    const parsed = repaired.Ok ? schema.safeParse(repaired.Value) : null;
    // The step reads the text without LaTeX markup and quotes from it (ADR 0089).
    const text = cleanLatexMarkup(entry.Publication.Text);
    const expected = entry.expected.candidates;
    if (expected.length === 0) {
      emptyEntries += 1;
    }
    if (trace) {
      traced += 1;
      returnedTotal += trace.Returned;
      droppedTotal += trace.Dropped;
      normalisedOnly += trace.NormalisedOnly;
    }
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      const output = parsed.data;
      failures.push(...extractionMissingQuotes(output, text).map((f) => `quote:${f}`));
      if (output.Candidates.length !== expected.length) {
        failures.push("candidate-count");
      }
      if (expected.length === 0 && output.Candidates.length === 0) {
        emptyCorrect += 1;
      }
      const counted = matchCandidates(expected, output.Candidates);
      matching.TruePositive += counted.TruePositive;
      matching.Returned += counted.Returned;
      matching.Expected += counted.Expected;
      if (trace && trace.Attempts === 1 && trace.Dropped === 0) {
        firstAttempt += 1;
      }
      const normalisedText = normalizeForQuote(text);
      for (const candidate of output.Candidates) {
        for (const field of QUOTE_FIELDS) {
          const quote = candidate[field];
          if (quote === null) {
            continue;
          }
          tracedQuotes += trace ? 1 : 0;
          const at = normalisedText.indexOf(normalizeForQuote(quote));
          if (at !== -1 && normalisedText.length > 0) {
            const tenth = Math.min(9, Math.floor((at / normalisedText.length) * 10));
            positions[tenth] = (positions[tenth] ?? 0) + 1;
          }
        }
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
      CandidateCount: parsed?.success ? parsed.data.Candidates.length : null,
      Confidence: parsed?.success ? parsed.data.Confidence : null,
    });
  }

  const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);
  const precision = ratio(matching.TruePositive, matching.Returned);
  const recall = ratio(matching.TruePositive, matching.Expected);
  const scored = results.filter(
    (result): result is ExtractionEntryResult & { Confidence: number } =>
      result.Confidence !== null,
  );
  const third = Math.floor(scored.length / 3);
  const byConfidence = [...scored].sort((a, b) => a.Confidence - b.Confidence);
  const passShare = (group: ReadonlyArray<{ Passed: boolean }>) =>
    ratio(group.filter((item) => item.Passed).length, group.length);
  return {
    ...report(results, threshold),
    Entries: results,
    Matching: {
      ...matching,
      Precision: precision,
      Recall: recall,
      F1: ratio(2 * precision * recall, precision + recall),
    },
    EmptyEntryAccuracy: emptyEntries === 0 ? null : emptyCorrect / emptyEntries,
    Quotes: {
      FirstAttempt: traced === 0 ? null : firstAttempt / traced,
      NormalisedOnly: tracedQuotes === 0 ? null : normalisedOnly / tracedQuotes,
      Dropped: traced === 0 ? null : ratio(droppedTotal, returnedTotal),
      Positions: positions,
    },
    Brier:
      scored.length === 0
        ? null
        : scored.reduce((sum, item) => sum + (item.Confidence - (item.Passed ? 1 : 0)) ** 2, 0) /
          scored.length,
    TopThirdAtLeastBottom:
      third === 0
        ? null
        : passShare(byConfidence.slice(-third)) >= passShare(byConfidence.slice(0, third)),
  };
}

/**
 * How stable the number of candidates is over repeated runs (REQ-TEST-007 AC5), report-only: the
 * share of entries with the same count in every run. An invalid output in any run counts as a
 * disagreement.
 */
export function extractionStability(
  runs: ReadonlyArray<ReadonlyArray<{ Id: string; CandidateCount: number | null }>>,
): number {
  const ids = runs[0]?.map((entry) => entry.Id) ?? [];
  if (ids.length === 0) {
    return 0;
  }
  const byRun = runs.map((run) => new Map(run.map((entry) => [entry.Id, entry.CandidateCount])));
  const stable = ids.filter((id) => {
    const counts = byRun.map((run) => run.get(id) ?? null);
    return counts[0] !== null && counts.every((count) => count === counts[0]);
  }).length;
  return stable / ids.length;
}
