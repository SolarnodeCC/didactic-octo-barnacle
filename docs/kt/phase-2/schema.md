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
| `processing_run` | `id`, `kind` (`daily`, `backfill`, `retraction-check`, `slice`), `day`, `status`, `started_at`, `ended_at`, `counts_json`, `failures_json`, `report_json` (from migration 0012) | UNIQUE (`kind`, `day`) for `daily`; index `day` |
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

The `redrive` table (`item_kind` (`publication`, `candidate`), `item_id`, `step`, `failure_class` (`transient`, `content`), `count`, `last_attempt_at`, `last_model`, `last_prompt_version`, `final`), UNIQUE (`item_kind`, `item_id`, `step`), arrives with migration 0011 (WP6). `processing_run.failures_json` lists the items marked `failed-final` that day.

Signals are nullable: a rule rejection has no signals, no model, and no prompt version (REQ-PROC-006 AC2). The signal columns carry a `signal_` prefix because `trigger` is an SQL keyword. A publication is triaged once; triaging again with a new prompt version is a backfill that replaces the row, and its model calls stay recorded.

## Migration 0010: cached input tokens

`model_call.cached_input_tokens` (INTEGER, NOT NULL, default 0, between 0 and `input_tokens`): the input tokens the provider served from its prompt cache, as Workers AI reports them in `usage.prompt_tokens_details.cached_tokens`. They are a part of `input_tokens` and are billed at the cached-input price of the price table, so the stored cost can be recomputed from the row and its `price_table_version` ([ADR 0078](../decisions/0078-cached-input-tokens-in-the-cost-estimate.md)). The column is added with `ALTER TABLE ... ADD COLUMN`: rows written before it, and a Worker that does not write it, read 0. Migration 0010 is `infrastructure/cloudflare/migrations/0010_model_call_cached_input_tokens.sql`.

## Migration 0013: quality

Migration 0013 is `infrastructure/cloudflare/migrations/0013_quality.sql` (WP9; REQ-NFR-023, ADR 0071, ADR 0115). It is expand-only.

| Table or column | Columns | Notes |
|---|---|---|
| `extraction_result.quote_positions_json` | ten counts, default `[]` | Kept quotes by the tenth of the sent text they start in |
| `quality_metric` | `day`, `metric`, `value`, `items` | PRIMARY (`day`, `metric`); each day's quality rates, the baseline of the drift check |

## Migration 0012: processing report

`processing_run.report_json` (TEXT, NULL until reported): the `ProcessingReport` of the run, written once the run is finished (WP9; REQ-NFR-005 AC3, REQ-NFR-008 AC2, ADR 0114). It holds IDs, counts, and amounts, never publication text. Migration 0012 is `infrastructure/cloudflare/migrations/0012_processing_report.sql`, added with `ALTER TABLE ... ADD COLUMN`, so it is expand-only.

## Migration 0011: recovery

Migration 0011 is `infrastructure/cloudflare/migrations/0011_recovery.sql` (WP6; REQ-PROC-010, REQ-DATA-012, ADR 0063). It is expand-only.

| Table or column | Columns | Notes |
|---|---|---|
| `redrive` | `id`, `item_kind`, `item_id`, `step`, `failure_class`, `count`, `last_attempt_at`, `last_failed_at`, `last_model`, `last_prompt_version`, `final`, `created_at`, `updated_at` | UNIQUE (`item_kind`, `item_id`, `step`); index (`step`, `final`). `count` is the number of re-drives made; `last_failed_at` dates the failure, so a content failure waits until the next day |
| `queue_message_log.replay_count`, `queue_message_log.dead_lettered_at` | | Automatic dead-letter replays, at most two per message ID, each `recovery.dead_letter_replay_hours` after the dead letter |
| `step_pause` | `step`, `paused_at`, `last_probe_at`, `resumed_at`, `alerted_at` | The breaker: a step is paused while `resumed_at` is empty |

## Migration 0014: thin slice

ADR 0054 planned this migration as 0010; it became 0011 when migration 0010 went to cached input tokens (ADR 0078), 0012 when migration 0011 went to recovery (WP6), and 0014 when migrations 0012 and 0013 went to the processing report and quality monitoring (WP9).

The tables of schema migration 0001 for the pipeline, with these changes:

- `pipeline_run`, with `cost_eur` stored as `cost_amount` and `cost_currency`.
- `pipeline_step`, `agent_output`, `evidence`.
- `opportunity`, `score_model`, `score`.

It adds no organization-scoped table. Those arrive with phase 4 (ADR 0019).

## Configuration keys

New keys for [defaults](../architecture/defaults.md). They are added there in the pull request that first reads them. WP4 added the `text.*` keys. WP6 reads `triage.accept_score_cut`, `ingestion.daily_extraction_limit`, `extraction.full_text_wait_hours`, the `recovery.*` keys, and a provisional `budget.daily_eur` (see [defaults](../architecture/defaults.md)); WP9 replaces it with the computed limit and adds the `budget.expected_daily_*` and `budget.measured_cost_*` keys (ADR 0113). WP7 reads `extraction.max_candidates_per_publication` (an existing key, `3`) and adds `extraction.generic_customer_terms`. WP1 added `processing.enabled`, `triage.admission_pool_days`, `extraction.full_text_max_chars`, `embedding.batch_size`, `retraction.lookback_days`, and `model.price_table_version`; ADR 0088 added `model.triage` and ADR 0091 `model.extraction`.

| Key | Default | Notes |
|---|---|---|
| `processing.enabled` | `false` | Turns the phase 2 consumers on per environment |
| `triage.admission_pool_days` | `7` | How long a passing publication waits for admission (ADR 0055) |
| `extraction.full_text_max_chars` | `24000` | Cut before the call; the quote check uses the cut text |
| `text.max_pdf_bytes` | `20971520` (20 MiB) | From measured peak memory, WP4 ([design](design.md#full-text), ADR 0009) |
| `text.max_pages` | `100` | From measured peak memory and CPU, WP4 (ADR 0009) |
| `text.min_chars` | `200` | Less text means no usable text layer, as in a scan (ADR 0009) |
| `text.backfill_per_run` | `500` | Stored PDFs without text queued at each ingestion start, WP4 |
| `embedding.batch_size` | `50` | Messages per embedding call |
| `budget.expected_daily_triaged`, `budget.expected_daily_embeddings` | `4634` (staging, production), `100` (local, preview) | Largest measured day until a steady state is known (ADR 0059); Worker variables per environment (ADR 0113) |
| `budget.measured_cost_days`, `budget.measured_cost_min_items` | `7`, `20` | When a step's measured cost replaces its estimate (ADR 0113) |
| `retraction.lookback_days` | `30` | How far back the weekly retraction check looks (ADR 0061) |
| `model.price_table_version` | `2026-11-11` | Versioned price table in `infrastructure/cloudflare`, used when the gateway gives no cost (REQ-NFR-011 AC2); cached input tokens at the cached-input price (ADR 0078) |
| `model.triage` | `@cf/google/gemma-4-26b-a4b-it`, thinking off, `triage@2`, `json-schema` | Chosen by benchmark round two ([ADR 0088](../decisions/0088-benchmark-round-two-selects-the-triage-model.md)); temperature and output budget come with the prompt version |
| `model.extraction` | `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, default reasoning, `extraction@4`, `json-schema` | Chosen by benchmark round three ([ADR 0091](../decisions/0091-benchmark-round-three-selects-the-extraction-model.md)); temperature and output budget come with the prompt version |
| `model.embedding` | `embedding.model` until the embedding benchmark of ADR 0010 (OQ-005) | Model name, version, sampling settings, and the reasoning setting when not the model's default (ADR 0086) |
| `extraction.generic_customer_terms` | `users`, `end users`, `people`, `persons`, `individuals`, `humans`, `everyone`, `society`, `the public` | A `Customer` equal to one of these fails its candidate (ADR 0066) |
| `extraction.full_text_wait_hours` | `24` | How long admission waits for full text before it admits on the abstract (ADR 0065) |
| `recovery.max_redrives` | `3` | Re-drives of a transient failure, at most one a day (ADR 0063) |
| `recovery.max_redrives_per_day` | `20` | Items re-driven a day; re-driven extractions also count toward the daily limit (ADR 0063) |
| `recovery.dead_letter_replay_hours` | `6` | Delay before a dead letter is replayed, at most twice (ADR 0063) |
| `recovery.breaker_failure_share` | `0.5` | Share of `provider-error` calls in an hour that pauses a step (ADR 0063) |
| `recovery.breaker_min_calls` | `10` | Calls a step needs in the hour before its share is judged, so one failed call does not pause it (WP6) |
| `monitor.baseline_days` | `14` | Days in the rolling median of each quality rate; no drift alert before that many days (ADR 0071) |
| `monitor.drift_band` | `0.5` | Relative move from the median that counts as drift (ADR 0071) |
| `monitor.min_daily_items` | `20` | Fewest items behind a rate before it can alert (ADR 0071) |
| `monitor.near_duplicate_cosine` | `0.92` | Publication-vector cosine for counting possible near-duplicate opportunities (ADR 0071) |

Schedules: admission at `0 11 * * *` UTC, after both ingestion crons, with the re-drive before it; the recovery check (dead-letter replay and breaker probe) every 30 minutes, `*/30 * * * *`. The retraction check stays `0 8 * * 1`. The slice trigger exists only in the local environment.

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
