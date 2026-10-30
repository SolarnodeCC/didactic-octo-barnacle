import { alertKey, formatAlert } from "./format.js";
import {
  commentOnAlertIssue,
  createAlertIssue,
  sendAlertEmail,
  type EmailConfig,
  type GithubConfig,
} from "./channels.js";
import { type AlertEvent, type AlertSink } from "./types.js";
import { type BackoffOptions, type FetchFn } from "../http/retry.js";
import { type SqlDatabase } from "../store/sql.js";

/** A repeat of the same key inside this window comments instead of alerting again. */
export const ALERT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AlertSinkOptions = {
  Db: SqlDatabase;
  Fetch: FetchFn;
  Backoff: BackoffOptions;
  Now: () => string;
  Environment: string;
  /** A channel without configuration is skipped; the other one still works. */
  Github?: GithubConfig;
  Email?: EmailConfig;
  Log?: (event: string, fields: Record<string, unknown>) => void;
};

type StateRow = { issue_number: number | null; first_alerted_at: string; occurrences: number };

/**
 * Alert delivery (REQ-NFR-019): a GitHub issue labelled `alert` and an email to the ops
 * address. A repeat of the same key (type, environment, source) within 24 hours adds a
 * comment to the open issue and sends nothing else (AC3). Each channel can fail alone;
 * a failure is logged without secrets and never reaches the caller (AC2).
 */
export function createAlertSink(options: AlertSinkOptions): AlertSink {
  const deps = { Fetch: options.Fetch, Backoff: options.Backoff };
  const log = (event: string, fields: Record<string, unknown>) => options.Log?.(event, fields);
  const failure = (channel: string, key: string, error: unknown) =>
    log("alert.delivery_failed", {
      channel,
      key,
      error: error instanceof Error ? error.message : "unknown error",
    });

  return async (event: AlertEvent) => {
    const key = alertKey(event.Type, options.Environment, event.Source);
    try {
      const now = options.Now();
      const { Title, Body } = formatAlert(options.Environment, event);
      const state = await options.Db.prepare(
        "SELECT issue_number, first_alerted_at, occurrences FROM alert_state WHERE alert_key = ?",
      )
        .bind(key)
        .first<StateRow>();
      const repeat =
        state && Date.parse(now) - Date.parse(state.first_alerted_at) < ALERT_DEDUPE_WINDOW_MS;

      if (state && repeat) {
        let issueNumber = state.issue_number;
        if (options.Github) {
          try {
            if (issueNumber === null) {
              // The first attempt could not open the issue; try again, without a new email.
              issueNumber = await createAlertIssue(options.Github, deps, { Title, Body });
            } else {
              await commentOnAlertIssue(
                options.Github,
                deps,
                issueNumber,
                `Repeated at ${now} (occurrence ${state.occurrences + 1}).\n\n${Body}`,
              );
            }
          } catch (error) {
            failure("github", key, error);
          }
        }
        await options.Db.prepare(
          "UPDATE alert_state SET issue_number = ?, last_alerted_at = ?, occurrences = occurrences + 1 WHERE alert_key = ?",
        )
          .bind(issueNumber, now, key)
          .run();
        log("alert.repeated", { key, runId: event.RunId });
        return;
      }

      let issueNumber: number | null = null;
      let delivered = false;
      if (options.Github) {
        try {
          issueNumber = await createAlertIssue(options.Github, deps, { Title, Body });
          delivered = true;
        } catch (error) {
          failure("github", key, error);
        }
      }
      if (options.Email) {
        try {
          await sendAlertEmail(options.Email, deps, { Subject: Title, Text: Body });
          delivered = true;
        } catch (error) {
          failure("email", key, error);
        }
      }
      if (!options.Github && !options.Email) {
        log("alert.not_configured", { key });
      }
      if (delivered) {
        // Stored only after delivery: an alert nobody received is tried again next time.
        await options.Db.prepare(
          "INSERT INTO alert_state (alert_key, issue_number, first_alerted_at, last_alerted_at, occurrences) VALUES (?, ?, ?, ?, 1) ON CONFLICT (alert_key) DO UPDATE SET issue_number = excluded.issue_number, first_alerted_at = excluded.first_alerted_at, last_alerted_at = excluded.last_alerted_at, occurrences = 1",
        )
          .bind(key, issueNumber, now, now)
          .run();
        log("alert.sent", { key, runId: event.RunId, issue: issueNumber });
      }
    } catch (error) {
      failure("state", key, error);
    }
  };
}
