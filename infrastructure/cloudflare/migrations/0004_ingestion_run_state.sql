-- Migration 0004: run state and queue message payloads for scheduled ingestion
-- (REQ-DATA-009, REQ-DATA-011). Additive (expand only): the previous Worker
-- version keeps working (REQ-NFR-020).

-- Where a run starts, how far it has paged, and the page cursor of the source.
-- `cursor` keeps the end of the window of the last successful run.
ALTER TABLE ingestion_run ADD COLUMN window_from TEXT;
ALTER TABLE ingestion_run ADD COLUMN page_cursor TEXT;
ALTER TABLE ingestion_run ADD COLUMN pages_done INTEGER NOT NULL DEFAULT 0;

-- The envelope as sent (IDs only), so a dead-lettered message can be replayed.
ALTER TABLE queue_message_log ADD COLUMN payload_json TEXT;
