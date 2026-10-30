-- Migration 0003: normalized title and first author key on publication (REQ-DATA-007).
-- Additive (expand only): the previous Worker version keeps working (REQ-NFR-020).
-- Matches on this key are flagged for review in title_author_review, never merged.

ALTER TABLE publication ADD COLUMN title_author_key TEXT;

CREATE INDEX publication_title_author_key_idx ON publication (title_author_key)
  WHERE title_author_key IS NOT NULL;
