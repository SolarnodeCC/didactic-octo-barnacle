import { notify } from "../alerts/notify.js";
import { fetchPageEnvelope, type PipelineDeps, type RunSource } from "../queue/deps.js";
import { reportForAlert } from "../report/safe-report.js";
import {
  createRun,
  finishRunStatement,
  findRunningRun,
  lastSuccessfulWindowEnd,
} from "../store/run-repo.js";
import { windowStart } from "./window.js";

export type StartRunResult =
  | { Outcome: "started"; RunId: string; WindowFrom: string }
  | { Outcome: "skipped"; RunId: string; Reason: string };

const HOUR_MS = 60 * 60 * 1000;

/** The start failed after the run row was stored; carries the run ID for the alert. */
export class StartRunError extends Error {
  constructor(
    message: string,
    readonly RunId: string,
  ) {
    super(message);
    this.name = "StartRunError";
  }
}

/**
 * Cron entry for one source (REQ-DATA-009): compute the window from the last
 * successful run, store the run, and queue its first page. A run that is still
 * `running` blocks a new one until it is older than `RunTimeoutHours`; then it is
 * closed as failed so the schedule cannot stall for good.
 */
export async function startRun(deps: PipelineDeps, source: RunSource): Promise<StartRunResult> {
  const now = deps.Now();

  const running = await findRunningRun(deps.Db, source);
  if (running) {
    const ageMs = Date.parse(now) - Date.parse(running.StartedAt);
    if (ageMs < deps.Config.RunTimeoutHours * HOUR_MS) {
      deps.Log?.("run.skipped", {
        runId: running.Id,
        source,
        reason: "previous run still running",
      });
      return { Outcome: "skipped", RunId: running.Id, Reason: "previous run still running" };
    }
    await deps.Db.batch([
      finishRunStatement(deps.Db, {
        Id: running.Id,
        Status: "failed",
        EndedAt: now,
        WindowEnd: running.StartedAt.slice(0, 10),
      }),
    ]);
    deps.Log?.("run.timed_out", { runId: running.Id, source });
    const report = await reportForAlert(deps, running.Id, now);
    await notify(deps, {
      Type: "run-timeout",
      Source: source,
      RunId: running.Id,
      Summary: `A run was still open after ${deps.Config.RunTimeoutHours} hours and was closed as failed.`,
      ...(report ? { Report: report } : {}),
    });
  }

  const from = windowStart({
    LastWindowEnd: await lastSuccessfulWindowEnd(deps.Db, source),
    Today: now.slice(0, 10),
    OverlapDays: deps.Config.OverlapDays,
    BackfillDays: deps.Config.BackfillDays,
  });
  const runId = `run_${source}_${now.replace(/\D/g, "").slice(0, 14)}_${deps.NewId().slice(0, 8)}`;
  await createRun(deps.Db, { Id: runId, Source: source, StartedAt: now, WindowFrom: from });

  try {
    await deps.Queue.send(fetchPageEnvelope(runId, source, 0));
  } catch (error) {
    await deps.Db.batch([
      finishRunStatement(deps.Db, {
        Id: runId,
        Status: "failed",
        EndedAt: deps.Now(),
        WindowEnd: now.slice(0, 10),
      }),
    ]);
    throw new StartRunError(
      `could not queue the first page: ${error instanceof Error ? error.message : "unknown error"}`,
      runId,
    );
  }
  deps.Log?.("run.started", { runId, source, windowFrom: from });
  return { Outcome: "started", RunId: runId, WindowFrom: from };
}
