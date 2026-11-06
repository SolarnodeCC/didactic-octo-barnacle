import {
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

function report(entries: EntryResult[], threshold: Threshold): EvalReport {
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

export type TriageEvalReport = EvalReport & {
  /** Share of entries on which the model read each signal as labelled. */
  SignalAgreement: Record<keyof TriageSignals, number>;
  Precision: number;
  Recall: number;
};

/**
 * Triage eval (REQ-PROC-008, docs/kt/agents/triage.md): an entry passes when the output
 * matches the schema, every signal agrees with the label, and the code decision follows.
 */
export async function runTriageEval(
  entries: readonly TriageEntry[],
  model: ModelFn,
  threshold: Threshold,
): Promise<TriageEvalReport> {
  const results: EntryResult[] = [];
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
      if (decision.Accepted) {
        predicted += 1;
        truePositive += entry.expected.accepted ? 1 : 0;
      }
      if (decision.Accepted !== entry.expected.accepted) {
        failures.push("decision");
      }
    }
    results.push({
      Id: entry.id,
      Passed: failures.length === 0,
      Failures: failures,
      Repairs: repaired.Repairs,
    });
  }
  const n = Math.max(entries.length, 1);
  return {
    ...report(results, threshold),
    SignalAgreement: Object.fromEntries(
      Object.entries(agree).map(([name, count]) => [name, count / n]),
    ) as Record<keyof TriageSignals, number>,
    Precision: predicted === 0 ? 0 : truePositive / predicted,
    Recall: actual === 0 ? 0 : truePositive / actual,
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
        ...extractionMissingQuotes(parsed.data, entry.Publication.Text).map((f) => `quote:${f}`),
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
