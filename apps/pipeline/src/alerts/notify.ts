import { type AlertEvent } from "./types.js";
import { type PipelineDeps } from "../queue/deps.js";

/** Raises an alert if a sink is configured; a failing sink never stops the pipeline. */
export async function notify(deps: PipelineDeps, event: AlertEvent): Promise<void> {
  try {
    await deps.Alert?.(event);
  } catch {
    deps.Log?.("alert.sink_failed", { type: event.Type, runId: event.RunId });
  }
}
