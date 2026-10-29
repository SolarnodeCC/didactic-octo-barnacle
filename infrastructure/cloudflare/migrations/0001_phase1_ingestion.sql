-- Phase 1 ingestion schema (REQ-NFR-020, ADR 0020).
-- Column names are snake_case in D1; Zod contracts in packages/models stay PascalCase.

CREATE TABLE publications (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  publication_date TEXT,
  doi TEXT,
  arxiv_id TEXT,
  arxiv_version INTEGER,
  topics_json TEXT NOT NULL DEFAULT '[]',
  citation_count INTEGER NOT NULL DEFAULT 0,
  completeness TEXT NOT NULL CHECK (completeness IN ('complete', 'incomplete')),
  missing_fields_json TEXT NOT NULL DEFAULT '[]',
  retraction_flag INTEGER NOT NULL DEFAULT 0 CHECK (retraction_flag IN (0, 1)),
  language TEXT,
  has_storable_pdf INTEGER NOT NULL DEFAULT 0 CHECK (has_storable_pdf IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX publications_doi_uidx ON publications (doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX publications_arxiv_id_uidx ON publications (arxiv_id) WHERE arxiv_id IS NOT NULL;

CREATE TABLE source_records (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publications (id),
  source TEXT NOT NULL CHECK (source IN ('openalex', 'arxiv', 'semantic-scholar')),
  source_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  metadata_license TEXT,
  open_access_url TEXT,
  pdf_url TEXT,
  pdf_license TEXT,
  UNIQUE (source, source_id)
);

CREATE INDEX source_records_publication_id_idx ON source_records (publication_id);

CREATE TABLE authors (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  orcid TEXT
);

CREATE UNIQUE INDEX authors_orcid_uidx ON authors (orcid) WHERE orcid IS NOT NULL;

CREATE TABLE authorships (
  publication_id TEXT NOT NULL REFERENCES publications (id),
  author_id TEXT NOT NULL REFERENCES authors (id),
  position INTEGER NOT NULL CHECK (position >= 0),
  affiliations_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (publication_id, author_id)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publications (id),
  content_hash TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  license TEXT NOT NULL,
  extracted_text_key TEXT,
  extractor_version TEXT,
  stored_at TEXT NOT NULL,
  UNIQUE (content_hash)
);

CREATE INDEX documents_publication_id_idx ON documents (publication_id);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('openalex', 'arxiv', 'semantic-scholar')),
  cursor TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  counts_json TEXT NOT NULL,
  failures_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX ingestion_runs_source_started_idx ON ingestion_runs (source, started_at);

CREATE TABLE ingestion_cursors (
  source TEXT PRIMARY KEY NOT NULL CHECK (source IN ('openalex', 'arxiv', 'semantic-scholar')),
  cursor TEXT,
  last_success_at TEXT
);

CREATE TABLE queue_message_logs (
  message_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'dead-lettered')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  dead_letter INTEGER NOT NULL DEFAULT 0 CHECK (dead_letter IN (0, 1)),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE title_author_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  review_key TEXT NOT NULL UNIQUE,
  incoming_source TEXT NOT NULL,
  incoming_source_id TEXT NOT NULL,
  existing_publication_id TEXT NOT NULL REFERENCES publications (id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
