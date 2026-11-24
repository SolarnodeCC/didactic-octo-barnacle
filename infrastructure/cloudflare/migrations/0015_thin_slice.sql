-- Migration 0015: the candidate pipeline and its opportunity, for the thin slice (WP10;
-- docs/kt/phase-2/schema.md; REQ-PROC-007, ADR 0015, ADR 0054, ADR 0117). The pipeline tables of
-- schema migration 0001, with cost stored as `cost_amount` and `cost_currency` (ADR 0054) and
-- the evidence columns of the agent contract. No organization-scoped table (ADR 0019).
-- Additive (expand only): new tables and one seed row (REQ-NFR-020, ADR 0028).

-- One run of the candidate Workflow. `processing_run_id` names the processing run that started it
-- (the `slice` run in phase 2).
CREATE TABLE pipeline_run (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES candidate (id),
  processing_run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'incomplete')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  cost_amount REAL NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  cost_currency TEXT NOT NULL DEFAULT 'EUR'
);

CREATE INDEX pipeline_run_candidate_idx ON pipeline_run (candidate_id);
CREATE INDEX pipeline_run_status_idx ON pipeline_run (status);

-- One row per Workflow step; (pipeline_run_id, step_name) is the step's idempotency key
-- (orchestration.md, REQ-AGENT-007 AC2).
CREATE TABLE pipeline_step (
  id TEXT PRIMARY KEY NOT NULL,
  pipeline_run_id TEXT NOT NULL REFERENCES pipeline_run (id),
  step_name TEXT NOT NULL CHECK (
    step_name IN (
      'research_analyst', 'problem_discovery', 'market_analysis', 'competition', 'relevance',
      'startup_generator', 'scoring'
    )
  ),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  completed_at TEXT,
  error_json TEXT,
  UNIQUE (pipeline_run_id, step_name)
);

-- An agent output is never overwritten: a rerun is a new pipeline run (data-model.md).
CREATE TABLE agent_output (
  id TEXT PRIMARY KEY NOT NULL,
  pipeline_run_id TEXT NOT NULL REFERENCES pipeline_run (id),
  candidate_id TEXT NOT NULL REFERENCES candidate (id),
  agent TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX agent_output_candidate_idx ON agent_output (candidate_id);
CREATE INDEX agent_output_agent_idx ON agent_output (agent);

-- One evidence item of an agent output (REQ-AGENT-008, contract-conventions.md).
CREATE TABLE evidence (
  id TEXT PRIMARY KEY NOT NULL,
  agent_output_id TEXT NOT NULL REFERENCES agent_output (id),
  field TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('publication-quote', 'related-publication', 'external-url', 'none-found')
  ),
  quote TEXT,
  publication_id TEXT,
  url TEXT,
  note TEXT,
  retrieved_at TEXT
);

CREATE INDEX evidence_agent_output_idx ON evidence (agent_output_id);

-- One opportunity per candidate (ADR 0015). `pipeline_status` is system state; a retracted
-- publication hides its opportunities (REQ-DATA-008 AC2).
CREATE TABLE opportunity (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidate (id),
  pipeline_status TEXT NOT NULL CHECK (pipeline_status IN ('complete', 'incomplete', 'hidden')),
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR hidden_reason IN ('retracted')),
  current_score_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A score model: the weights in percent and the version of the derivation rules (REQ-SCORE-003).
CREATE TABLE score_model (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL UNIQUE,
  weights_json TEXT NOT NULL,
  derivation_rule_version TEXT NOT NULL,
  currency_rates_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);

-- A score is never overwritten; the opportunity points to its current one (REQ-SCORE-001 AC4).
CREATE TABLE score (
  id TEXT PRIMARY KEY NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES opportunity (id),
  score_model_id TEXT NOT NULL REFERENCES score_model (id),
  categories_json TEXT NOT NULL,
  explanation_json TEXT NOT NULL,
  weighted_sum REAL NOT NULL CHECK (weighted_sum >= 0 AND weighted_sum <= 100),
  final_score INTEGER NOT NULL CHECK (final_score >= 0 AND final_score <= 100),
  band TEXT NOT NULL CHECK (band IN ('Low', 'Medium', 'High', 'Exceptional')),
  estimate_based INTEGER NOT NULL DEFAULT 0 CHECK (estimate_based IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX score_opportunity_idx ON score (opportunity_id);

-- The placeholder score model of the thin slice (ADR 0117): the derivation rules of ADR 0005
-- with equal weights. It is not active; phase 4 adds score model version 1 (REQ-SCORE-003).
INSERT INTO score_model (id, version, weights_json, derivation_rule_version, currency_rates_json, active)
VALUES (
  'sm_placeholder_0',
  'placeholder-0',
  '{"ScientificNovelty":20,"MarketPotential":20,"CompetitiveGap":20,"TechnicalFeasibility":20,"StrategicRelevance":20}',
  'adr-0005',
  '{"EUR":1}',
  0
);
