import { CRON_SOURCES } from "../config.js";
import { notify } from "../alerts/notify.js";
import { type PipelineDeps } from "../queue/deps.js";
import { startRun, StartRunError, type StartRunResult } from "./start-run.js";

/** Handles a cron trigger; an unknown cron expression starts nothing. */
export async function runScheduled(
  deps: PipelineDeps,
  cron: string,
): Promise<StartRunResult | null> {
  const source = CRON_SOURCES[cron];
  if (!source) {
    deps.Log?.("cron.unknown", { cron });
    return null;
  }
  try {
    return await startRun(deps, source);
  } catch (error) {
    // The run could not start: tell a person, then let the cron report the failure too.
    const runId = error instanceof StartRunError ? error.RunId : undefined;
    deps.Log?.("run.start_failed", { source, runId });
    await notify(deps, {
      Type: "failed-run",
      Source: source,
      ...(runId ? { RunId: runId } : {}),
      Summary: `The scheduled start failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    throw error;
  }
}
