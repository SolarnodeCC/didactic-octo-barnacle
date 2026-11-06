-- Migration 0008: an index for the case-insensitive OpenAlex ID lookup of deduplication
-- (REQ-DATA-007, REQ-NFR-010). Additive (expand only): no column changes, and the previous
-- Worker version runs the same query, only faster (REQ-NFR-020).

-- Deduplication matches an incoming record against `lower(source_work_id)`, which the
-- `UNIQUE (source, source_work_id)` index cannot serve, so every OpenAlex record scanned
-- all OpenAlex source records. SQLite uses an expression index when the query has the same
-- expression, so existing rows need no backfill.
CREATE INDEX source_record_openalex_lower_idx ON source_record (source, lower(source_work_id));
