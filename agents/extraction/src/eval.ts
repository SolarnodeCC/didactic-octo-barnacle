import {
  cleanLatexMarkup,
  decideTriage,
  extractionMissingQuotes,
  extractionOutputSchema,
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
 * Extraction eval, deterministic checks only (REQ-PROC-009): schema, verbatim quotes
 * (REQ-AGENT-008), and the number of candidates. The reference check of `Finding` and
 * `Customer` needs a model judge with a rubric (OQ-020) and is not part of this runner yet.
 */
export async function runExtractionEval(
  entries: readonly ExtractionEntry[],
  model: ModelFn,
  threshold: Threshold,
  maxCandidates?: number,
): Promise<EvalReport> {
  const schema = extractionOutputSchema(maxCandidates);
  const results: EntryResult[] = [];
  for (const entry of entries) {
    const failures: string[] = [];
    const repaired = repairModelOutput(await model(entry.Publication), schema);
    const parsed = repaired.Ok ? schema.safeParse(repaired.Value) : null;
    if (!parsed?.success) {
      failures.push("schema");
    } else {
      failures.push(
        // The step reads the text without LaTeX markup and quotes from it (ADR 0089).
        ...extractionMissingQuotes(parsed.data, cleanLatexMarkup(entry.Publication.Text)).map(
          (f) => `quote:${f}`,
        ),
      );
      if (parsed.data.Candidates.length !== entry.expected.candidates.length) {
        failures.push("candidate-count");
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
    });
  }
  return report(results, threshold);
}
