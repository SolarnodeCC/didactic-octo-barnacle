-- Migration 0007: the end date of the window a run covers (REQ-DATA-009). Additive
-- (expand only): the previous Worker version keeps working and leaves it empty
-- (REQ-NFR-020).

-- A run that stops at the page cap is continued by the next run of the same source.
-- The continuing run keeps the `window_end` of the first run of the chain, so the
-- `succeeded` run that closes the chain stores that date in `cursor` and the next
-- window overlaps everything published since the chain began. Empty means the date
-- of `started_at`.
ALTER TABLE ingestion_run ADD COLUMN window_end TEXT;
