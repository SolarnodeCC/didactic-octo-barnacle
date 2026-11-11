---
title: Phase 2 schema, configuration, and bindings
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-NFR-020, REQ-NFR-011, REQ-PROC-001, REQ-PROC-006, REQ-PROC-009, REQ-DATA-006, REQ-DATA-008, REQ-PROC-007]
---

# Phase 2 schema, configuration, and bindings

The migrations are expand-only (ADR 0028, REQ-NFR-020) and follow the conventions of [schema migration 0001](../architecture/schema-migration-0001.md): ULID text keys, ISO-8601 UTC text times, and booleans as 0/1. When a migration lands, its tables move into that document's implementation notes and `EXPECTED_PHASE1_TABLES` gains a phase 2 list.

## Migration 0009: processing

It extends the tables planned in schema migration 0001 with the fields that REQ-PROC-006, REQ-PROC-009, and REQ-NFR-011 require and that the planned columns lack.

| Table | Columns | Keys and indexes |
|---|---|---|
| `processing_run` | `id`, `kind` (`daily`, `backfill`, `retraction-check`, `slice`), `day`, `status`, `started_at`, `ended_at`, `counts_json`, `failures_json` | UNIQUE (`kind`, `day`) for `daily`; index `day` |
| `model_call` | `id`, `run_kind` (`processing`, `pipeline`), `run_id`, `step_name`, `agent`, `publication_id`, `candidate_id`, `model`, `prompt_version`, `attempt`, `input_tokens`, `cached_input_tokens` (from migration 0010), `output_tokens`, `latency_ms`, `cost_amount`, `cost_currency`, `price_table_version`, `estimated`, `outcome` (`ok`, `invalid-output`, `provider-error`), `gateway_request_id`, `call_kind` (`model`, `search`), `search_query`, `search_result_count`, `created_at` | index (`run_kind`, `run_id`); index `created_at`. No prompt or publication text |
| `budget_day` | `day`, `limit_amount`, `spent_amount`, `currency`, `stopped_at`, `alerted_at` | PRIMARY `day` |
| `embedding_index` | `id`, `binding`, `vectorize_name`, `model_name`, `model_version`, `dimensions`, `metric`, `current`, `backfill_started_at`, `backfill_done_at` | UNIQUE `vectorize_name`; at most one row with `current = 1` |
| `embedding` | `id`, `publication_id`, `embedding_index_id`, `vectorize_id`, `model_name`, `model_version`, `input_kind` (`title-abstract`, `title-only`), `created_at` | UNIQUE (`publication_id`, `embedding_index_id`) |
| `triage_decision` | `id`, `publication_id`, `run_id`, `status` (`decided`, `awaiting-admission`), `accepted`, `score`, `reason`, `signal_named_party`, `signal_stated_harm`, `signal_trigger`, `signal_existing_alternative`, `signal_adoptable`, `notes`, `model`, `prompt_version`, `admitted_on`, `created_at`, `updated_at` | UNIQUE `publication_id`; index (`status`, `created_at`) |
| `extraction_result` | `id`, `publication_id`, `run_id`, `model`, `prompt_version`, `input_mode` (`abstract`, `full-text`), `confidence`, `notes`, `candidate_count`, `created_at` | UNIQUE `publication_id` |
| `candidate` | `id`, `publication_id`, `extraction_result_id`, `finding`, `evidence_quote`, `customer`, `customer_quote`, `why_now`, `why_now_quote`, `current_alternative`, `alternative_quote`, `hidden_reason`, `created_at` | index `publication_id` |
| `admission_day` | `day`, `daily_limit`, `admitted`, `deferred`, `ran_at` | PRIMARY `day` |

Added columns:

- `publication.retraction_handled_at` (REQ-DATA-008).
- `document.failure_reason` (REQ-DATA-006). `document.status` gains the values `text-extracted` and `text-failed`. The column has no check constraint today, so this needs no table rebuild.

Migration 0009 is `infrastructure/cloudflare/migrations/0009_processing.sql`. The daily limit of `admission_day` is named `daily_limit`, because `LIMIT` is an SQL keyword. `triage_decision.reason` is empty only while a passing publication waits for its first admission; the row contracts are in `packages/models/src/processing.ts` and `model-call.ts`.

## Re-drive state (ADR 0063)

The `redrive` table (`item_kind` (`publication`, `candidate`), `item_id`, `step`, `failure_class` (`transient`, `content`), `count`, `last_attempt_at`, `last_model`, `last_prompt_version`, `final`), UNIQUE (`item_kind`, `item_id`, `step`), arrives in the migration of the first work package that re-drives. `processing_run.failures_json` lists the items marked `failed-final` that day.

Signals are nullable: a rule rejection has no signals, no model, and no prompt version (REQ-PROC-006 AC2). The signal columns carry a `signal_` prefix because `trigger` is an SQL keyword. A publication is triaged once; triaging again with a new prompt version is a backfill that replaces the row, and its model calls stay recorded.

## Migration 0010: cached input tokens

`model_call.cached_input_tokens` (INTEGER, NOT NULL, default 0, between 0 and `input_tokens`): the input tokens the provider served from its prompt cache, as Workers AI reports them in `usage.prompt_tokens_details.cached_tokens`. They are a part of `input_tokens` and are billed at the cached-input price of the price table, so the stored cost can be recomputed from the row and its `price_table_version` ([ADR 0078](../decisions/0078-cached-input-tokens-in-the-cost-estimate.md)). The column is added with `ALTER TABLE ... ADD COLUMN`: rows written before it, and a Worker that does not write it, read 0. Migration 0010 is `infrastructure/cloudflare/migrations/0010_model_call_cached_input_tokens.sql`.

## Migration 0011: thin slice

ADR 0054 planned this migration as 0010; it became 0011 when migration 0010 went to cached input tokens (ADR 0078).

The tables of schema migration 0001 for the pipeline, with these changes:

- `pipeline_run`, with `cost_eur` stored as `cost_amount` and `cost_currency`.
- `pipeline_step`, `agent_output`, `evidence`.
- `opportunity`, `score_model`, `score`.

It adds no organization-scoped table. Those arrive with phase 4 (ADR 0019).

## Configuration keys

New keys for [defaults](../architecture/defaults.md). They are added there in the pull request that first reads them. WP1 added `processing.enabled`, `triage.admission_pool_days`, `extraction.full_text_max_chars`, `embedding.batch_size`, `retraction.lookback_days`, and `model.price_table_version`.

| Key | Default | Notes |
|---|---|---|
| `processing.enabled` | `false` | Turns the phase 2 consumers on per environment |
| `triage.admission_pool_days` | `7` | How long a passing publication waits for admission (ADR 0055) |
| `extraction.full_text_max_chars` | `24000` | Cut before the call; the quote check uses the cut text |
| `text.max_pdf_bytes` | set in WP4 | From measured peak memory (ADR 0009) |
| `text.max_pages` | set in WP4 | From measured peak memory and CPU (ADR 0009) |
| `embedding.batch_size` | `50` | Messages per embedding call |
| `budget.expected_daily_triaged`, `budget.expected_daily_embeddings` | from the measured daily volume | Largest measured day until a steady state is known (ADR 0059) |
| `retraction.lookback_days` | `30` | How far back the weekly retraction check looks (ADR 0061) |
| `model.price_table_version` | `2026-11-11` | Versioned price table in `infrastructure/cloudflare`, used when the gateway gives no cost (REQ-NFR-011 AC2); cached input tokens at the cached-input price (ADR 0078) |
| `model.triage`, `model.extraction`, `model.embedding` | from the ADR that closes OQ-036; `model.triage` and `model.extraction` are not set, because round one qualified no model ([ADR 0082](../decisions/0082-benchmark-round-one-selects-no-model.md)) | Model name, version, sampling settings, and the reasoning setting when not the model's default (ADR 0086) |
| `extraction.generic_customer_terms` | `users`, `end users`, `people`, `persons`, `individuals`, `humans`, `everyone`, `society`, `the public` | A `Customer` equal to one of these fails its candidate (ADR 0066) |
| `extraction.full_text_wait_hours` | `24` | How long admission waits for full text before it admits on the abstract (ADR 0065) |
| `recovery.max_redrives` | `3` | Re-drives of a transient failure, at most one a day (ADR 0063) |
| `recovery.max_redrives_per_day` | `20` | Items re-driven a day; re-driven extractions also count toward the daily limit (ADR 0063) |
| `recovery.dead_letter_replay_hours` | `6` | Delay before a dead letter is replayed, at most twice (ADR 0063) |
| `recovery.breaker_failure_share` | `0.5` | Share of `provider-error` calls in an hour that pauses a step (ADR 0063) |
| `monitor.baseline_days` | `14` | Days in the rolling median of each quality rate; no drift alert before that many days (ADR 0071) |
| `monitor.drift_band` | `0.5` | Relative move from the median that counts as drift (ADR 0071) |
| `monitor.min_daily_items` | `20` | Fewest items behind a rate before it can alert (ADR 0071) |
| `monitor.near_duplicate_cosine` | `0.92` | Publication-vector cosine for counting possible near-duplicate opportunities (ADR 0071) |

Schedules: admission at `0 11 * * *` UTC, after both ingestion crons. The retraction check stays `0 8 * * 1`. The slice trigger exists only in the local environment.

## Bindings

| Binding | Resource | Environments |
|---|---|---|
| `AI` | Workers AI, called with the gateway `roi-<env>` | all |
| `PUBLICATION_VECTORS` | Vectorize `roi-publications-<env>`, 768 dimensions, cosine (ADR 0027), metadata indexes `source` and `published_day` | all |
| `TEXT_QUEUE` | `roi-texts-<env>` and `roi-texts-dlq-<env>` | all |
| `EMBEDDING_QUEUE` | `roi-embeddings-<env>` and `roi-embeddings-dlq-<env>` | all |
| `MODEL_QUEUE` | `roi-models-<env>` and `roi-models-dlq-<env>` | all |
| `CANDIDATE_WORKFLOW` | Workflow class `CandidateWorkflow` | local and preview in phase 2 |

The gateway and Vectorize index are already in the bootstrap list (`infrastructure/cloudflare/src/bootstrap.ts`). The queues, the metadata indexes, and the Workflow are added there first. Secrets: none new. Workers AI and AI Gateway are reached through bindings, and the eval judge keys of [operations](../operations.md) stay in the `evals` environment.
