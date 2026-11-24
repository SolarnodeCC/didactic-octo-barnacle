-- Migration 0016: the daily review queue, error tags, structured corrections, and undo of the
-- owner review tool (ADR 0124; REQ-REV-006, REQ-REV-007, REQ-REV-008). Additive (expand only):
-- new columns with defaults and a new table; the pipeline never reads them (REQ-NFR-020).

-- Error tags of the verdict as a JSON array of tag names (tag list `tags-v1`).
ALTER TABLE output_review ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
-- Structured correction as JSON: corrected triage signals, or the changed candidate fields.
ALTER TABLE output_review ADD COLUMN corrected_json TEXT;
-- Set when the reviewer undoes the verdict. A withdrawn verdict stays as history but is no longer
-- current; the newest verdict that is not withdrawn is.
ALTER TABLE output_review ADD COLUMN withdrawn_at TEXT;

-- The daily sample: drawn once per decision day, so the queue is the same on every reload.
CREATE TABLE review_sample (
  day TEXT NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  stratum TEXT NOT NULL CHECK (
    stratum IN ('new-prompt', 'borderline', 'accepted-empty', 'low-confidence', 'model-rejection', 'random')
  ),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, publication_id)
);

CREATE INDEX review_sample_day_idx ON review_sample (day, position);
