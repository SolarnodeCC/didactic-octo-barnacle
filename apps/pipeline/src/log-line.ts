/** Events that signal trouble get a higher level so they can be filtered. */
function levelOf(event: string): "info" | "warn" | "error" {
  if (/(failed|failure|timed_out|dead_letter\.(recorded|unreadable)|delivery_failed)/.test(event)) {
    return "error";
  }
  if (/(refused|skipped|unknown|repeated|not_configured)/.test(event)) {
    return "warn";
  }
  return "info";
}

/**
 * One structured log line (REQ-NFR-008 AC1). Fields carry the run ID and, where it
 * applies, the publication ID. The canonical keys come last, so a field can never replace
 * the timestamp, level, event name, or environment.
 */
export function logLine(
  environment: string,
  event: string,
  fields: Record<string, unknown>,
  now: () => string = () => new Date().toISOString(),
): string {
  return JSON.stringify({ ...fields, ts: now(), level: levelOf(event), event, env: environment });
}
