import { CRON_SOURCES } from "../config.js";
import { type PipelineDeps } from "../queue/deps.js";
import { startRun, type StartRunResult } from "./start-run.js";

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
  return startRun(deps, source);
}
