-- Migration 0014: verdicts of the owner review tool on triage decisions and extraction
-- candidates (ADR 0116; REQ-REV-003, REQ-REV-004). Additive (expand only): a new table that
-- the pipeline never reads or writes (REQ-NFR-020, ADR 0028).

-- One row per verdict. A newer row on the same target replaces the current verdict; older rows
-- stay as history. `reviewer_opaque` is the Cloudflare Access subject, never an email address.
-- `model` and `prompt_version` are copied from the judged output, so verdicts can be grouped by
-- the version they judged even after a rerun.
CREATE TABLE output_review (
  id TEXT PRIMARY KEY NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('triage', 'candidate')),
  target_id TEXT NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'unsure')),
  corrected TEXT CHECK (corrected IS NULL OR length(corrected) <= 2000),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  reviewer_opaque TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX output_review_target_idx ON output_review (target_kind, target_id, created_at);
CREATE INDEX output_review_publication_idx ON output_review (publication_id, created_at);
