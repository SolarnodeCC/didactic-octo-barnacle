import {
  type CallModelDeps,
  type CallModelResult,
  type CallOutputMode,
  type ModelCallRecord,
  type ModelUsageStore,
  type PriceTable,
  type WorkersAiBinding,
  type WorkersAiRunOptions,
} from "@roi/models";

import {
  runExtractionEval,
  runTriageEval,
  type EvalReport,
  type TriageEvalReport,
} from "../eval.js";
import { type ExtractionEntry, type Threshold, type TriageEntry } from "../golden-set.js";
import { extractionModelFn, triageModelFn } from "../model-fn.js";

/**
 * One benchmark round (docs/kt/test/model-benchmark-plan.md): every candidate of a step runs
 * every golden-set item `Runs` times through `callModel` with the same prompt version and
 * sampling settings. It records the plan's metrics per step and model, keeps every raw
 * response, and stops starting new steps once the model cost reaches the budget.
 */

export type BenchmarkStep = "triage" | "extraction";

export type BenchmarkPlan = {
  /** Identifies the round in records, gateway logs, and the raw-response keys. */
  BenchmarkId: string;
  Steps: BenchmarkStep[];
  /** Exact, pinned model IDs per step (REQ-AGENT-014). */
  Models: Record<BenchmarkStep, string[]>;
  Runs: number;
  OutputMode: CallOutputMode;
  /** Total model cost allowed for the round, in euro (the plan's budget is 50). */
  BudgetEur: number;
};

export type BenchmarkInputs = {
  Triage: { Entries: TriageEntry[]; Threshold: Threshold };
  Extraction: { Entries: ExtractionEntry[]; Threshold: Threshold };
};

export type BenchmarkDeps = {
  Ai: WorkersAiBinding;
  GatewayId: string;
  Prices: PriceTable;
  MaxAttempts: number;
  NewId: () => string;
  Now: () => Date;
  Sleep: (ms: number) => Promise<void>;
  /** Progress lines, for example to stderr. */
  Log?: (line: string) => void;
  /** Runs that a stopped round already finished: they make no calls and count as they were. */
  Resume?: readonly RunCheckpoint[];
  /** Called after every finished run, so the caller can store it before the next one starts. */
  OnRunComplete?: (checkpoint: RunCheckpoint) => void | Promise<void>;
};

/** One raw provider response, with the publication and attempt it belongs to. */
export type RawCall = {
  BenchmarkId: string;
  Step: BenchmarkStep;
  Model: string;
  Run: number;
  PublicationId: string;
  Call: number;
  GatewayLogId: string | null;
  Response: unknown;
  Error: string | null;
};

export type RunSummary = {
  Run: number;
  PassRate: number;
  ThresholdPassed: boolean;
  SignalAgreement?: TriageEvalReport["SignalAgreement"];
  Precision?: number;
  Recall?: number;
};

/** How one item of a run ended in `callModel`, without its output. */
export type ItemOutcome = {
  Ok: boolean;
  /** Accepted on the first attempt. */
  FirstAttempt: boolean;
  /** Accepted after a repair (REQ-AGENT-011). */
  Repaired: boolean;
  /** Refused before any call because the budget was spent; not counted as attempted. */
  BudgetExhausted: boolean;
};

/**
 * Everything one finished run of one step and model leaves behind: enough to resume a round
 * after it without new calls, and to compute the summary, stability included, as if the round
 * had not stopped.
 */
export type RunCheckpoint = {
  BenchmarkId: string;
  Step: BenchmarkStep;
  Model: string;
  Run: number;
  Summary: RunSummary;
  /** Pass or fail per golden-set entry ID. */
  EntryPassed: Record<string, boolean>;
  Outcomes: ItemOutcome[];
  BudgetRefused: number;
  Records: ModelCallRecord[];
  Raw: RawCall[];
};

export type ModelSummary = {
  Step: BenchmarkStep;
  Model: string;
  Runs: RunSummary[];
  MeanPassRate: number;
  MinPassRate: number;
  /** Share of items whose pass or fail is the same in every run. */
  Stability: number;
  Steps: number;
  /** Share of steps accepted on the first attempt. */
  FirstAttemptValid: number;
  /** Share of accepted steps that needed a repair (REQ-AGENT-011). */
  RepairRate: number;
  /** Share of steps that failed after the last attempt. */
  FailedAfterMaxAttempts: number;
  BudgetRefused: number;
  ProviderErrors: number;
  LatencyMsP50: number;
  LatencyMsP95: number;
  CostEur: number;
  CostPerStepEur: number;
};

export type BenchmarkResult = {
  BenchmarkId: string;
  Summaries: ModelSummary[];
  Records: ModelCallRecord[];
  Raw: RawCall[];
  TotalCostEur: number;
  /** True when the budget stopped steps from starting; the round is then incomplete. */
  BudgetReached: boolean;
};

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/** Captures every response and error of the binding, so they can be kept and graded again. */
class RecordingBinding implements WorkersAiBinding {
  readonly Pending: Array<
    Omit<RawCall, "BenchmarkId" | "Step" | "Model" | "Run" | "PublicationId">
  > = [];
  constructor(
    private readonly inner: WorkersAiBinding,
    /** Calls numbered before this binding started, when a round resumes. */
    private calls = 0,
  ) {}

  get aiGatewayLogId(): string | null {
    return this.inner.aiGatewayLogId ?? null;
  }

  async run(
    model: string,
    inputs: Record<string, unknown>,
    options: WorkersAiRunOptions,
  ): Promise<unknown> {
    this.calls += 1;
    try {
      const response = await this.inner.run(model, inputs, options);
      this.Pending.push({
        Call: this.calls,
        GatewayLogId: this.aiGatewayLogId,
        Response: response,
        Error: null,
      });
      return response;
    } catch (error) {
      this.Pending.push({
        Call: this.calls,
        GatewayLogId: this.aiGatewayLogId,
        Response: null,
        Error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

class BudgetUsage implements ModelUsageStore {
  readonly Records: ModelCallRecord[] = [];
  SpentEur = 0;
  Refused = 0;
  constructor(private readonly limitEur: number) {}
  /** Counts the records of a resumed run as if its calls had just been made. */
  replay(records: readonly ModelCallRecord[], refused: number): void {
    for (const record of records) {
      this.Records.push(record);
      this.SpentEur += record.Cost.Amount;
    }
    this.Refused += refused;
  }
  budgetAllows(): Promise<boolean> {
    const allowed = this.SpentEur < this.limitEur;
    if (!allowed) {
      this.Refused += 1;
    }
    return Promise.resolve(allowed);
  }
  record(record: ModelCallRecord): Promise<void> {
    this.Records.push(record);
    this.SpentEur += record.Cost.Amount;
    return Promise.resolve();
  }
}

function outcomeOf(result: CallModelResult<unknown>): ItemOutcome {
  return {
    Ok: result.Ok,
    FirstAttempt: result.Ok && result.Attempts === 1,
    Repaired: result.Ok && result.Repairs.length > 0,
    BudgetExhausted: !result.Ok && result.Reason === "budget-exhausted",
  };
}

/** The plan's metrics for one step and model, from its finished runs. */
export function summarizeRuns(
  step: BenchmarkStep,
  model: string,
  checkpoints: readonly RunCheckpoint[],
): ModelSummary {
  const runs = checkpoints.map((c) => c.Summary);
  const passedByEntry = new Map<string, boolean[]>();
  for (const checkpoint of checkpoints) {
    for (const [id, passed] of Object.entries(checkpoint.EntryPassed)) {
      passedByEntry.set(id, [...(passedByEntry.get(id) ?? []), passed]);
    }
  }
  const outcomes = checkpoints.flatMap((c) => c.Outcomes);
  const attempted = outcomes.filter((o) => !o.BudgetExhausted);
  const ok = attempted.filter((o) => o.Ok);
  const records = checkpoints.flatMap((c) => c.Records);
  const latencies = records.filter((r) => r.Outcome === "ok").map((r) => r.LatencyMs);
  const cost = records.reduce((sum, r) => sum + r.Cost.Amount, 0);
  const passRates = runs.map((r) => r.PassRate);
  const stableEntries = [...passedByEntry.values()].filter(
    (passes) => passes.every((p) => p) || passes.every((p) => !p),
  ).length;
  return {
    Step: step,
    Model: model,
    Runs: runs,
    MeanPassRate: passRates.reduce((a, b) => a + b, 0) / Math.max(passRates.length, 1),
    MinPassRate: passRates.length === 0 ? 0 : Math.min(...passRates),
    Stability: passedByEntry.size === 0 ? 0 : stableEntries / passedByEntry.size,
    Steps: attempted.length,
    FirstAttemptValid:
      attempted.length === 0 ? 0 : ok.filter((o) => o.FirstAttempt).length / attempted.length,
    RepairRate: ok.length === 0 ? 0 : ok.filter((o) => o.Repaired).length / ok.length,
    FailedAfterMaxAttempts:
      attempted.length === 0 ? 0 : (attempted.length - ok.length) / attempted.length,
    BudgetRefused: checkpoints.reduce((sum, c) => sum + c.BudgetRefused, 0),
    ProviderErrors: records.filter((r) => r.Outcome === "provider-error").length,
    LatencyMsP50: percentile(latencies, 50),
    LatencyMsP95: percentile(latencies, 95),
    CostEur: cost,
    CostPerStepEur: attempted.length === 0 ? 0 : cost / attempted.length,
  };
}

function checkpointKey(step: BenchmarkStep, model: string, run: number): string {
  return `${step}|${model}|${run}`;
}

export async function runBenchmark(
  plan: BenchmarkPlan,
  inputs: BenchmarkInputs,
  deps: BenchmarkDeps,
): Promise<BenchmarkResult> {
  const resumed = new Map<string, RunCheckpoint>();
  for (const checkpoint of deps.Resume ?? []) {
    if (checkpoint.BenchmarkId !== plan.BenchmarkId) {
      throw new Error(
        `checkpoint of ${checkpoint.BenchmarkId} does not belong to ${plan.BenchmarkId}`,
      );
    }
    if (
      !plan.Steps.includes(checkpoint.Step) ||
      !plan.Models[checkpoint.Step].includes(checkpoint.Model) ||
      checkpoint.Run < 1 ||
      checkpoint.Run > plan.Runs
    ) {
      throw new Error(
        `checkpoint ${checkpoint.Step} ${checkpoint.Model} run ${checkpoint.Run} is not in the plan`,
      );
    }
    resumed.set(checkpointKey(checkpoint.Step, checkpoint.Model, checkpoint.Run), checkpoint);
  }
  const lastCall = Math.max(0, ...[...resumed.values()].flatMap((c) => c.Raw.map((r) => r.Call)));
  const binding = new RecordingBinding(deps.Ai, lastCall);
  const usage = new BudgetUsage(plan.BudgetEur);
  const callDeps: CallModelDeps = {
    Ai: binding,
    GatewayId: deps.GatewayId,
    Usage: usage,
    Prices: deps.Prices,
    MaxAttempts: deps.MaxAttempts,
    NewId: deps.NewId,
    Now: deps.Now,
    Sleep: deps.Sleep,
  };
  const raw: RawCall[] = [];
  const summaries: ModelSummary[] = [];

  for (const step of plan.Steps) {
    for (const model of plan.Models[step]) {
      // Refuse an unpriced model before any call, like callModel does per step.
      if (deps.Prices.Models[model] === undefined) {
        throw new Error(`model ${model} has no price in table ${deps.Prices.Version}`);
      }
      const checkpoints: RunCheckpoint[] = [];

      for (let run = 1; run <= plan.Runs; run += 1) {
        const done = resumed.get(checkpointKey(step, model, run));
        if (done !== undefined) {
          usage.replay(done.Records, done.BudgetRefused);
          raw.push(...done.Raw);
          checkpoints.push(done);
          deps.Log?.(
            `${step} ${model} run ${run}/${plan.Runs}: resumed, pass rate ${done.Summary.PassRate.toFixed(3)}, spent EUR ${usage.SpentEur.toFixed(4)}`,
          );
          continue;
        }
        const runId = `${plan.BenchmarkId}:${step}:${model}:r${run}`;
        const recordsBefore = usage.Records.length;
        const rawBefore = raw.length;
        const refusedBefore = usage.Refused;
        const outcomes: ItemOutcome[] = [];
        const onResult = (publicationId: string, result: CallModelResult<unknown>): void => {
          outcomes.push(outcomeOf(result));
          for (const call of binding.Pending.splice(0)) {
            raw.push({
              BenchmarkId: plan.BenchmarkId,
              Step: step,
              Model: model,
              Run: run,
              PublicationId: publicationId,
              ...call,
            });
          }
        };
        const options = {
          Deps: callDeps,
          Model: model,
          RunId: runId,
          OutputMode: plan.OutputMode,
          OnResult: onResult,
        };
        let report: EvalReport | TriageEvalReport;
        let summary: RunSummary;
        if (step === "triage") {
          const triage = await runTriageEval(
            inputs.Triage.Entries,
            triageModelFn(options),
            inputs.Triage.Threshold,
          );
          report = triage;
          summary = {
            Run: run,
            PassRate: triage.PassRate,
            ThresholdPassed: triage.Passed,
            SignalAgreement: triage.SignalAgreement,
            Precision: triage.Precision,
            Recall: triage.Recall,
          };
        } else {
          report = await runExtractionEval(
            inputs.Extraction.Entries,
            extractionModelFn(options),
            inputs.Extraction.Threshold,
          );
          summary = { Run: run, PassRate: report.PassRate, ThresholdPassed: report.Passed };
        }
        const checkpoint: RunCheckpoint = {
          BenchmarkId: plan.BenchmarkId,
          Step: step,
          Model: model,
          Run: run,
          Summary: summary,
          EntryPassed: Object.fromEntries(report.Entries.map((e) => [e.Id, e.Passed])),
          Outcomes: outcomes,
          BudgetRefused: usage.Refused - refusedBefore,
          Records: usage.Records.slice(recordsBefore),
          Raw: raw.slice(rawBefore),
        };
        checkpoints.push(checkpoint);
        await deps.OnRunComplete?.(checkpoint);
        deps.Log?.(
          `${step} ${model} run ${run}/${plan.Runs}: pass rate ${report.PassRate.toFixed(3)}, spent EUR ${usage.SpentEur.toFixed(4)}`,
        );
      }

      summaries.push(summarizeRuns(step, model, checkpoints));
    }
  }

  return {
    BenchmarkId: plan.BenchmarkId,
    Summaries: summaries,
    Records: usage.Records,
    Raw: raw,
    TotalCostEur: usage.SpentEur,
    BudgetReached: usage.Refused > 0,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

/** A markdown report of a round, for the ADR that closes OQ-036. */
export function formatBenchmarkMarkdown(result: BenchmarkResult, plan: BenchmarkPlan): string {
  const lines = [
    `# Model benchmark ${result.BenchmarkId}`,
    "",
    `Runs per item: ${plan.Runs}. Output mode: ${plan.OutputMode}. Total cost: EUR ${result.TotalCostEur.toFixed(4)} of EUR ${plan.BudgetEur}.`,
    result.BudgetReached
      ? "**The budget was reached: some steps did not start, so this round is incomplete.**"
      : "The budget was not reached.",
    "",
    "| Step | Model | Mean pass rate | Min pass rate | Threshold met in all runs | Stability | First-attempt valid | Repair rate | Failed after max attempts | Provider errors | p50 / p95 latency (ms) | Cost per step (EUR) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...result.Summaries.map(
      (s) =>
        `| ${s.Step} | \`${s.Model}\` | ${pct(s.MeanPassRate)} | ${pct(s.MinPassRate)} | ${s.Runs.every((r) => r.ThresholdPassed) ? "yes" : "no"} | ${pct(s.Stability)} | ${pct(s.FirstAttemptValid)} | ${pct(s.RepairRate)} | ${pct(s.FailedAfterMaxAttempts)} | ${s.ProviderErrors} | ${s.LatencyMsP50} / ${s.LatencyMsP95} | ${s.CostPerStepEur.toFixed(6)} |`,
    ),
  ];
  const triage = result.Summaries.filter((s) => s.Step === "triage");
  if (triage.length > 0) {
    lines.push(
      "",
      "## Triage signal agreement (mean over runs)",
      "",
      "| Model | NamedParty | StatedHarm | Trigger | ExistingAlternative | Adoptable | Precision | Recall |",
      "|---|---|---|---|---|---|---|---|",
      ...triage.map((s) => {
        const mean = (pick: (r: RunSummary) => number): string =>
          pct(s.Runs.reduce((sum, r) => sum + pick(r), 0) / Math.max(s.Runs.length, 1));
        return `| \`${s.Model}\` | ${mean((r) => r.SignalAgreement?.NamedParty ?? 0)} | ${mean((r) => r.SignalAgreement?.StatedHarm ?? 0)} | ${mean((r) => r.SignalAgreement?.Trigger ?? 0)} | ${mean((r) => r.SignalAgreement?.ExistingAlternative ?? 0)} | ${mean((r) => r.SignalAgreement?.Adoptable ?? 0)} | ${mean((r) => r.Precision ?? 0)} | ${mean((r) => r.Recall ?? 0)} |`;
      }),
    );
  }
  lines.push(
    "",
    "Extraction scores the deterministic checks only (schema, verbatim quotes, candidate count). The model judge for `Finding` and `Customer` (OQ-020) is not part of this round.",
    "",
  );
  return lines.join("\n");
}
