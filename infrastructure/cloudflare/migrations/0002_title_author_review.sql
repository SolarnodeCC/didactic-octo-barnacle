-- Migration 0002: title-and-first-author matches flagged for human review (REQ-DATA-007).
-- Never auto-merged; see docs/kt/architecture/schema-migration-0001.md.

CREATE TABLE title_author_review (
  id TEXT PRIMARY KEY NOT NULL,
  review_key TEXT NOT NULL UNIQUE,
  incoming_source TEXT NOT NULL CHECK (incoming_source IN ('openalex', 'arxiv')),
  incoming_source_work_id TEXT NOT NULL,
  existing_publication_id TEXT NOT NULL REFERENCES publication (id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
