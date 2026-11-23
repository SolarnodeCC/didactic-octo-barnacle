-- Migration 0012: the stored report of a processing run (docs/kt/phase-2/schema.md; REQ-NFR-005
-- AC3, REQ-NFR-008 AC2, ADR 0114). Additive (expand only): existing rows and a Worker that does
-- not write the column keep NULL, which means "not reported yet" (REQ-NFR-020, ADR 0028).

-- The ProcessingReport of the run as JSON: counts, failed-final items, the day's budget, and the
-- cost per publication and per opportunity. It holds IDs, counts, and amounts, never text.
ALTER TABLE processing_run ADD COLUMN report_json TEXT;
