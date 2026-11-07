-- Migration 0009: phase 2 processing (docs/kt/phase-2/schema.md; REQ-NFR-011, REQ-PROC-001,
-- REQ-PROC-004, REQ-PROC-006, REQ-PROC-008, REQ-PROC-009, REQ-DATA-006, REQ-DATA-008).
-- Additive (expand only): the phase 1 Worker reads none of these tables and keeps working
-- (REQ-NFR-020, ADR 0028). ULID text keys, ISO-8601 UTC text times, booleans as 0/1.

CREATE TABLE processing_run (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'backfill', 'retraction-check', 'slice')),
  day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  counts_json TEXT NOT NULL DEFAULT '{}',
  failures_json TEXT NOT NULL DEFAULT '[]'
);

-- One daily run per UTC day, so a repeated trigger finds the existing run.
CREATE UNIQUE INDEX processing_run_daily_uidx ON processing_run (kind, day) WHERE kind = 'daily';
CREATE INDEX processing_run_day_idx ON processing_run (day);

-- One row per model or search call attempt (REQ-NFR-011). No prompt or publication text.
CREATE TABLE model_call (
  id TEXT PRIMARY KEY NOT NULL,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('processing', 'pipeline')),
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  agent TEXT,
  publication_id TEXT,
  candidate_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cost_amount REAL NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  cost_currency TEXT NOT NULL,
  price_table_version TEXT,
  estimated INTEGER NOT NULL DEFAULT 0 CHECK (estimated IN (0, 1)),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'invalid-output', 'provider-error')),
  gateway_request_id TEXT,
  call_kind TEXT NOT NULL DEFAULT 'model' CHECK (call_kind IN ('model', 'search')),
  search_query TEXT,
  search_result_count INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX model_call_run_idx ON model_call (run_kind, run_id);
CREATE INDEX model_call_created_at_idx ON model_call (created_at);

-- Spend per UTC day against the daily model budget (REQ-NFR-005, ADR 0059).
CREATE TABLE budget_day (
  day TEXT PRIMARY KEY NOT NULL,
  limit_amount REAL NOT NULL CHECK (limit_amount >= 0),
  spent_amount REAL NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  currency TEXT NOT NULL,
  stopped_at TEXT,
  alerted_at TEXT
);

-- The Vectorize index registry (ADR 0056). WP5 seeds the existing index.
CREATE TABLE embedding_index (
  id TEXT PRIMARY KEY NOT NULL,
  binding TEXT NOT NULL,
  vectorize_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  metric TEXT NOT NULL CHECK (metric IN ('cosine', 'euclidean', 'dot-product')),
  current INTEGER NOT NULL DEFAULT 0 CHECK (current IN (0, 1)),
  backfill_started_at TEXT,
  backfill_done_at TEXT,
  UNIQUE (vectorize_name)
);

-- At most one current index.
CREATE UNIQUE INDEX embedding_index_current_uidx ON embedding_index (current) WHERE current = 1;

CREATE TABLE embedding (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  embedding_index_id TEXT NOT NULL REFERENCES embedding_index (id),
  vectorize_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  input_kind TEXT NOT NULL CHECK (input_kind IN ('title-abstract', 'title-only')),
  created_at TEXT NOT NULL,
  UNIQUE (publication_id, embedding_index_id)
);

-- One triage decision per publication. Signals are empty for a rule rejection
-- (REQ-PROC-006 AC2); `signal_` avoids the SQL keyword `trigger`.
CREATE TABLE triage_decision (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('decided', 'awaiting-admission')),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
  score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  reason TEXT CHECK (
    reason IS NULL OR reason IN (
      'accepted', 'incomplete', 'retracted', 'out-of-scope', 'low-score', 'daily-limit'
    )
  ),
  signal_named_party INTEGER CHECK (signal_named_party IN (0, 1)),
  signal_stated_harm INTEGER CHECK (signal_stated_harm IN (0, 1)),
  signal_trigger INTEGER CHECK (signal_trigger IN (0, 1)),
  signal_existing_alternative INTEGER CHECK (signal_existing_alternative IN (0, 1)),
  signal_adoptable INTEGER CHECK (signal_adoptable IN (0, 1)),
  notes TEXT,
  model TEXT,
  prompt_version TEXT,
  admitted_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id)
);

CREATE INDEX triage_decision_status_created_idx ON triage_decision (status, created_at);

CREATE TABLE extraction_result (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  run_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_mode TEXT NOT NULL CHECK (input_mode IN ('abstract', 'full-text')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  notes TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (publication_id)
);

CREATE TABLE candidate (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  extraction_result_id TEXT NOT NULL REFERENCES extraction_result (id),
  finding TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,
  customer TEXT NOT NULL,
  customer_quote TEXT NOT NULL,
  why_now TEXT,
  why_now_quote TEXT,
  current_alternative TEXT,
  alternative_quote TEXT,
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR hidden_reason IN ('retracted')),
  created_at TEXT NOT NULL
);

CREATE INDEX candidate_publication_idx ON candidate (publication_id);

-- One admission run per UTC day (ADR 0055). `daily_limit` because LIMIT is an SQL keyword.
CREATE TABLE admission_day (
  day TEXT PRIMARY KEY NOT NULL,
  daily_limit INTEGER NOT NULL CHECK (daily_limit >= 0),
  admitted INTEGER NOT NULL DEFAULT 0 CHECK (admitted >= 0),
  deferred INTEGER NOT NULL DEFAULT 0 CHECK (deferred >= 0),
  ran_at TEXT NOT NULL
);

-- When the admission sweep handled a retracted publication (REQ-DATA-008).
ALTER TABLE publication ADD COLUMN retraction_handled_at TEXT;

-- Why text extraction failed; `document.status` gains `text-extracted` and `text-failed`
-- with no table rebuild, because the column has no check constraint (REQ-DATA-006).
ALTER TABLE document ADD COLUMN failure_reason TEXT;
