-- Migration 0005: alert deduplication state (REQ-NFR-019 AC3, ADR 0028).
-- A new table only (expand only): the previous Worker version keeps working.

-- One row per alert key (type, environment, source). Within 24 hours of
-- `first_alerted_at` a repeat adds a comment to `issue_number` instead of opening
-- another issue or sending another email.
CREATE TABLE alert_state (
  alert_key TEXT PRIMARY KEY NOT NULL,
  issue_number INTEGER,
  first_alerted_at TEXT NOT NULL,
  last_alerted_at TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences >= 1)
);
