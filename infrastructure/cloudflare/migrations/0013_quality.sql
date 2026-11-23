-- Migration 0013: what the daily quality section needs beyond the existing rows
-- (docs/kt/phase-2/schema.md; REQ-NFR-023, ADR 0071). Additive (expand only): existing rows and
-- a Worker that does not write the new column keep an empty list (REQ-NFR-020, ADR 0028).

-- Where the kept quotes of an extraction start in the text that was sent: ten counts, one per
-- tenth of its length (ADR 0071, ADR 0065). Counts only, never text.
ALTER TABLE extraction_result ADD COLUMN quote_positions_json TEXT NOT NULL DEFAULT '[]';

-- One row per quality metric and day: its value and the items behind it. The baseline of a
-- metric is the median of its values over the previous `monitor.baseline_days` days.
CREATE TABLE quality_metric (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  items INTEGER NOT NULL CHECK (items >= 0),
  PRIMARY KEY (day, metric)
);
