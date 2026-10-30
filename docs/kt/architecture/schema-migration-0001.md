---
title: Migration 0001 schema design
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-020, REQ-DATA-005, REQ-DATA-007, REQ-DATA-011, REQ-NFR-018, REQ-ACC-002, REQ-ACC-004]
---

# Migration 0001 schema design

Physical D1 tables for the first SQL migration (`infrastructure/cloudflare/migrations/0001_init.sql`). Logical records are in [data model](data-model.md). Column names here are binding for migration 0001; later migrations use expand/contract (ADR 0020).

## Conventions

- Primary keys are `TEXT` ULIDs unless noted.
- Timestamps are ISO-8601 text in UTC.
- Booleans are `INTEGER` 0/1.
- Organization-scoped tables include `organization_id TEXT NOT NULL` (ADR 0019). Shared research tables do not.

## Shared research corpus

| Table | Key columns | Uniqueness / indexes |
|---|---|---|
| `publication` | `id`, `title`, `abstract`, `published_at`, `doi`, `arxiv_id`, `arxiv_version`, `citation_count`, `completeness` (`complete`/`incomplete`), `retracted` | UNIQUE `doi` where not null; UNIQUE `arxiv_id` where not null; index `published_at` |
| `source_record` | `id`, `publication_id`, `source` (`openalex`/`arxiv`), `source_work_id`, `fetched_at`, `metadata_license`, `raw_r2_key` | UNIQUE (`source`, `source_work_id`); index `publication_id` |
| `author` | `id`, `display_name`, `orcid` | UNIQUE `orcid` where not null |
| `authorship` | `publication_id`, `author_id`, `affiliation`, `position` | PRIMARY (`publication_id`, `author_id`) |
| `document` | `id`, `publication_id`, `pdf_r2_key`, `content_hash`, `license`, `extracted_text_r2_key`, `extractor_version`, `status` | UNIQUE `content_hash`; UNIQUE `publication_id` |
| `embedding` | `id`, `publication_id`, `vectorize_id`, `model_name`, `model_version`, `created_at` | UNIQUE (`publication_id`, `model_name`, `model_version`) |
| `ingestion_run` | `id`, `source`, `cursor`, `started_at`, `ended_at`, `counts_json`, `failures_json` | index `source`, `started_at` |
| `queue_message_log` | `id`, `message_id`, `type`, `schema_version`, `status`, `attempts`, `dead_letter`, `updated_at` | UNIQUE `message_id`; index `status` |
| `triage_decision` | `id`, `publication_id`, `score`, `accepted`, `reason`, `created_at` | index `publication_id` |
| `candidate` | `id`, `publication_id`, `finding`, `evidence_quote`, `created_at` | index `publication_id` |
| `pipeline_run` | `id`, `candidate_id`, `status`, `started_at`, `ended_at`, `cost_eur` | index `candidate_id`, `status` |
| `pipeline_step` | `id`, `pipeline_run_id`, `step_name`, `status`, `attempt`, `completed_at`, `error_json` | UNIQUE (`pipeline_run_id`, `step_name`) |
| `agent_output` | `id`, `pipeline_run_id`, `candidate_id`, `agent`, `envelope_json`, `output_json`, `created_at` | index `candidate_id`, `agent` |
| `evidence` | `id`, `agent_output_id`, `field`, `kind`, `quote`, `url`, `retrieved_at` | index `agent_output_id` |
| `model_call` | `id`, `pipeline_run_id`, `step_name`, `agent`, `model`, `prompt_version`, `attempt`, `input_tokens`, `output_tokens`, `latency_ms`, `cost_eur`, `estimated`, `outcome`, `call_kind` (`model`/`search`), `search_query`, `search_result_count` | index `pipeline_run_id`; no prompt or publication text |
| `opportunity` | `id`, `candidate_id`, `pipeline_status` (`complete`/`incomplete`/`hidden`), `hidden_reason`, `current_score_id` | UNIQUE `candidate_id` |
| `admin_action` | `id`, `actor_user_id`, `action`, `opportunity_id`, `reason`, `created_at` | index `opportunity_id` |
| `score_model` | `id`, `version`, `weights_json`, `derivation_rule_version`, `currency_rates_json`, `active` | UNIQUE `version` |
| `score` | `id`, `opportunity_id`, `score_model_id`, `categories_json`, `explanation_json`, `final_score`, `band`, `estimate_based`, `created_at` | index `opportunity_id` |

## Auth and tenancy

| Table | Key columns | Uniqueness / indexes |
|---|---|---|
| `organization` | `id`, `name`, `created_at` | one row in the MVP |
| `user` | `id`, `organization_id`, `email`, `name`, `role`, `status`, `terms_version`, `terms_accepted_at`, `created_at` | UNIQUE (`organization_id`, `email`) |
| `invitation` | `id`, `organization_id`, `email`, `role`, `inviter_user_id`, `token_hash`, `expires_at`, `status` | UNIQUE `token_hash`; index `organization_id`, `status` |
| `sign_in_link` | `id`, `user_id`, `token_hash`, `expires_at`, `used_at` | UNIQUE `token_hash` |
| `session` | `id`, `organization_id`, `user_id`, `token_hash`, `expires_at`, `created_at`, `revoked_at` | UNIQUE `token_hash`; index `user_id` |
| `csrf_token` | `id`, `token_hash`, `session_id` nullable, `expires_at` | UNIQUE `token_hash` |
| `audit_event` | `id`, `organization_id`, `actor_id_opaque`, `action`, `created_at`, `meta_json` | index `organization_id`, `created_at` |
| `delivery_event` | `id`, `invitation_id` nullable, `sign_in_link_id` nullable, `provider_event`, `created_at` | index `created_at` |
| `legal_document_version` | `id`, `kind` (`terms`/`privacy`), `version`, `published_at`, `body_r2_key` | UNIQUE (`kind`, `version`) |
| `score_review` | `id`, `organization_id`, `score_id`, `user_id`, `state`, `reason`, `created_at` | index `score_id`, `organization_id` |
| `opportunity_status_entry` | `id`, `organization_id`, `opportunity_id`, `user_id`, `status`, `note`, `created_at` | index `opportunity_id`, `organization_id` |

## Dual status

- `opportunity.pipeline_status` is system state: `complete`, `incomplete`, or `hidden` (REQ-SCORE-005, REQ-ADM-001).
- `opportunity_status_entry.status` is user decision state: `pursued`, `parked`, or `rejected` (REQ-DASH-004).
- List filters expose both: `pipeline_status` only to admins for hidden; `status` (decision) to all roles as a filter on the latest entry.

## Completeness

`publication.completeness` is `complete` when title, abstract, and at least one stable external ID (DOI or arXiv ID) are present; otherwise `incomplete`. Opportunity completeness follows REQ-SCORE-005 (all five categories present).
