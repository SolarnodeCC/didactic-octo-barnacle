import { type RunReport } from "@roi/models";

import { buildRunReport } from "./build-run-report.js";
import { type PipelineDeps } from "../queue/deps.js";

/**
 * The run report for an alert. It is extra detail: if it cannot be built, the alert is
 * still sent without it, and the reason is logged.
 */
export async function reportForAlert(
  deps: PipelineDeps,
  runId: string,
  now: string,
): Promise<RunReport | null> {
  try {
    return await buildRunReport(deps.Db, runId, now);
  } catch (error) {
    deps.Log?.("report.failed", {
      runId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}
