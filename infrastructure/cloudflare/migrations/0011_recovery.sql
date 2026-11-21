-- Migration 0011: automatic recovery of phase 2 steps (docs/kt/phase-2/schema.md; REQ-PROC-010,
-- REQ-DATA-012, ADR 0063). Additive (expand only): the earlier Worker reads none of these
-- tables or columns and keeps working (REQ-NFR-020, ADR 0028).

-- One row per item and step that ended without a stored result. `count` is the number of
-- re-drives made; `last_attempt_at` the last re-drive; `last_failed_at` the last failure;
-- `last_model` and `last_prompt_version` what the failed attempt ran on (ADR 0063).
CREATE TABLE redrive (
  id TEXT PRIMARY KEY NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('publication', 'candidate')),
  item_id TEXT NOT NULL,
  step TEXT NOT NULL,
  failure_class TEXT NOT NULL CHECK (failure_class IN ('transient', 'content')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_attempt_at TEXT,
  last_failed_at TEXT NOT NULL,
  last_model TEXT,
  last_prompt_version TEXT,
  final INTEGER NOT NULL DEFAULT 0 CHECK (final IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (item_kind, item_id, step)
);

CREATE INDEX redrive_step_final_idx ON redrive (step, final);

-- Automatic dead-letter replay (REQ-DATA-012): how often a message was replayed without a
-- person, and when it last went to the dead-letter queue.
ALTER TABLE queue_message_log ADD COLUMN replay_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE queue_message_log ADD COLUMN dead_lettered_at TEXT;

-- The circuit breaker of a model step (REQ-PROC-010 AC6): paused while `resumed_at` is empty.
CREATE TABLE step_pause (
  step TEXT PRIMARY KEY NOT NULL,
  paused_at TEXT NOT NULL,
  last_probe_at TEXT,
  resumed_at TEXT,
  alerted_at TEXT
);
