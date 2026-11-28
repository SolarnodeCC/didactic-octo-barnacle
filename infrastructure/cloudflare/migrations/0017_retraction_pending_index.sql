-- Migration 0017: an index for the retraction sweep of the daily admission cron (REQ-DATA-008,
-- ADR 0126). Without it, finding the few retracted publications not yet handled scans every
-- publication row; on staging that took 10.8 s on 2026-11-28 and exhausted D1's resource window,
-- so the admission cron failed. Additive (expand only): a new partial index (REQ-NFR-020).
CREATE INDEX publication_retraction_pending_idx ON publication (id)
  WHERE retracted = 1 AND retraction_handled_at IS NULL;
