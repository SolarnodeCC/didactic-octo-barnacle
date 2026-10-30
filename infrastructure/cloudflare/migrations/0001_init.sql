-- Migration 0001: shared research corpus, phase 1 ingestion subset (REQ-NFR-020, ADR 0020).
-- Table and column names follow docs/kt/architecture/schema-migration-0001.md.
-- Columns marked "additive" are not in that document; they carry fields the
-- @roi/models contracts need. This file is frozen at the phase 1 ingestion tables;
-- the other tables in the document (triage, agents, scoring, auth, tenancy) come in
-- new numbered migrations (ADR 0028).
-- Zod fields stay PascalCase in packages/models; the repository layer maps them.

CREATE TABLE publication (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  published_at TEXT,
  doi TEXT,
  arxiv_id TEXT,
  arxiv_version INTEGER,
  citation_count INTEGER NOT NULL DEFAULT 0,
  completeness TEXT NOT NULL CHECK (completeness IN ('complete', 'incomplete')),
  retracted INTEGER NOT NULL DEFAULT 0 CHECK (retracted IN (0, 1)),
  -- additive
  topics_json TEXT NOT NULL DEFAULT '[]',
  missing_fields_json TEXT NOT NULL DEFAULT '[]',
  language TEXT,
  has_storable_pdf INTEGER NOT NULL DEFAULT 0 CHECK (has_storable_pdf IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX publication_doi_uidx ON publication (doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX publication_arxiv_id_uidx ON publication (arxiv_id) WHERE arxiv_id IS NOT NULL;
CREATE INDEX publication_published_at_idx ON publication (published_at);

CREATE TABLE source_record (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  source TEXT NOT NULL CHECK (source IN ('openalex', 'arxiv')),
  source_work_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  metadata_license TEXT,
  raw_r2_key TEXT,
  -- additive
  open_access_url TEXT,
  pdf_url TEXT,
  pdf_license TEXT,
  UNIQUE (source, source_work_id)
);

CREATE INDEX source_record_publication_id_idx ON source_record (publication_id);

CREATE TABLE author (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  orcid TEXT
);

CREATE UNIQUE INDEX author_orcid_uidx ON author (orcid) WHERE orcid IS NOT NULL;

CREATE TABLE authorship (
  publication_id TEXT NOT NULL REFERENCES publication (id),
  author_id TEXT NOT NULL REFERENCES author (id),
  affiliation TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  -- additive: every affiliation; `affiliation` holds the first
  affiliations_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (publication_id, author_id)
);

CREATE TABLE document (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publication (id),
  pdf_r2_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  license TEXT NOT NULL,
  extracted_text_r2_key TEXT,
  extractor_version TEXT,
  status TEXT NOT NULL DEFAULT 'stored',
  -- additive
  stored_at TEXT NOT NULL,
  UNIQUE (content_hash),
  UNIQUE (publication_id)
);

CREATE TABLE ingestion_run (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('openalex', 'arxiv')),
  cursor TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  counts_json TEXT NOT NULL,
  failures_json TEXT NOT NULL DEFAULT '[]',
  -- additive
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial'))
);

CREATE INDEX ingestion_run_source_started_idx ON ingestion_run (source, started_at);

CREATE TABLE queue_message_log (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'dead-lettered')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  dead_letter INTEGER NOT NULL DEFAULT 0 CHECK (dead_letter IN (0, 1)),
  updated_at TEXT NOT NULL,
  -- additive
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (message_id)
);

CREATE INDEX queue_message_log_status_idx ON queue_message_log (status);
