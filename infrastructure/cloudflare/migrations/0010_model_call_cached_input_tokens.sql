-- Migration 0010: cached input tokens of a model call (docs/kt/phase-2/schema.md; REQ-NFR-011,
-- ADR 0078). Additive (expand only): existing rows and a Worker that does not write the column
-- get 0, which is what an uncached call reports (REQ-NFR-020, ADR 0028).

-- Input tokens served from the provider's prompt cache. They are a part of `input_tokens` and
-- are billed at the cached-input price of the price table, so the stored cost can be
-- recomputed from the row and its `price_table_version`.
ALTER TABLE model_call ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0
  CHECK (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens);
