import { type AlertEvent } from "./types.js";
import { sanitizeReason } from "../report/sanitize.js";

const MAX_LISTED_FAILURES = 5;

export function alertKey(type: string, environment: string, source: string): string {
  return `${type}|${environment}|${source}`;
}

/** Where the run report will be served once the admin API exists (phase 4, REQ-ADM-004). */
export function reportPath(runId: string): string {
  return `/admin/runs/${runId}`;
}

/** A plain-text alert: the same text is the issue body and the email body. */
export function formatAlert(
  environment: string,
  event: AlertEvent,
): { Title: string; Body: string } {
  const lines = [`Alert: ${event.Type}`, `Environment: ${environment}`, `Source: ${event.Source}`];
  if (event.RunId) {
    lines.push(`Run: ${event.RunId}`);
  }
  if (event.MessageId) {
    lines.push(`Message: ${event.MessageId}`);
  }
  lines.push("", sanitizeReason(event.Summary));

  const report = event.Report;
  if (report) {
    const c = report.Counts;
    lines.push(
      "",
      `Run status: ${report.Status}, pages: ${report.PagesDone}, window from: ${report.WindowFrom ?? "n/a"}`,
      `Counts: fetched ${c.Fetched}, created ${c.Created}, updated ${c.Updated}, skipped ${c.Skipped}, failed ${c.Failed}, dead-lettered ${c.DeadLettered}`,
      `Data quality: ${report.DataQuality.IncompleteRecords} incomplete, ${report.DataQuality.DuplicatesFlagged} duplicates flagged, ${report.DataQuality.FailedPdfs} failed PDFs`,
    );
    const failures = report.Failures.slice(0, MAX_LISTED_FAILURES);
    if (failures.length > 0) {
      lines.push("", "Failed items:");
      for (const failure of failures) {
        lines.push(`- ${failure.SourceId ?? "run"}: ${sanitizeReason(failure.Reason)}`);
      }
      if (report.Failures.length > failures.length) {
        lines.push(`- and ${report.Failures.length - failures.length} more`);
      }
    }
    if (report.DeadLetteredMessages.length > 0) {
      lines.push(
        "",
        `Dead-lettered messages: ${report.DeadLetteredMessages.slice(0, 5).join(", ")}`,
      );
    }
  }
  if (event.RunId) {
    lines.push("", `Run report: ${reportPath(event.RunId)} (served by the admin API from phase 4)`);
  }
  return {
    Title: `[alert] ${event.Type} in ${environment} (${event.Source})`,
    Body: lines.join("\n"),
  };
}
