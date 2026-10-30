-- Migration 0006: author erasure and the audit log (REQ-NFR-016, REQ-ACC-009, ADR 0028).
-- New tables and indexes only (expand only): the previous Worker version keeps working.

-- Erasing an author must hold: the next ingestion would otherwise fetch the same work
-- and store the author again. A tombstone holds a keyed hash of the stored author ID
-- (HMAC with a Worker secret), never the name, ORCID, or affiliation. Ingestion skips
-- an author whose hash is listed here.
CREATE TABLE author_erasure (
  id TEXT PRIMARY KEY NOT NULL,
  subject_hash TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('author-request', 'legal-order', 'ingested-in-error')),
  erased_at TEXT NOT NULL
);

-- Columns follow docs/kt/architecture/schema-migration-0001.md. `organization_id` is empty
-- for platform-level events on the shared research corpus, which has no organization
-- (ADR 0019); account events from phase 4 carry it. The log never holds personal data.
CREATE TABLE audit_event (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT,
  actor_id_opaque TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_event_org_created_idx ON audit_event (organization_id, created_at);

-- Erasure and the author lookup go by author, which the primary key (publication, author)
-- does not serve.
CREATE INDEX authorship_author_id_idx ON authorship (author_id);
CREATE INDEX author_display_name_idx ON author (lower(display_name));
