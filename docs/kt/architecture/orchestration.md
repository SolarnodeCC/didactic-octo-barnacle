---
title: Pipeline orchestration
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-AGENT-007, REQ-AGENT-009, REQ-AGENT-011, REQ-AGENT-012, REQ-AGENT-013, REQ-PROC-004, REQ-PROC-005, REQ-PROC-006, REQ-SCORE-007, REQ-ADM-002]
---

# Pipeline orchestration

This document describes how one publication becomes zero or more scored opportunities. The runtime is decided in ADR 0003 and the service mapping in ADR 0004. Numeric defaults and queue types are in [defaults](defaults.md).

## Core workflow mapping

| Core workflow step ([overview](../overview.md)) | Component | Requirement |
|---|---|---|
| Scientific Research | Collector and triage | REQ-DATA-001, REQ-DATA-002, REQ-PROC-005 |
| Problem Discovery | Research Analyst, then Problem Discovery | REQ-AGENT-001, REQ-AGENT-002 |
| Market Analysis | Market Analysis | REQ-AGENT-003 |
| Competitive Analysis | Competition | REQ-AGENT-004 |
| Software Opportunity Discovery | Opportunity extraction | REQ-PROC-004 |
| Startup Generation | Startup Generator | REQ-AGENT-005 |
| Business Case Creation | Startup Generator (BusinessCase) | REQ-AGENT-005 |
| Opportunity Scoring | Relevance, then the scoring engine | REQ-AGENT-006, REQ-SCORE-001 |

In the running pipeline, extraction comes first: it turns a publication into candidates, and the agents analyze each candidate. The extraction output contract is in [opportunity extraction](../agents/opportunity-extraction.md).

## Pipeline

```text
publication
  └─ triage (rules, then a cheap model)            REQ-PROC-005, REQ-PROC-006
      └─ opportunity extraction → 0..N candidates   REQ-PROC-004
          └─ per candidate:
              Research Analyst                      REQ-AGENT-001
              Problem Discovery                     REQ-AGENT-002
              ├─ Market Analysis      (parallel)    REQ-AGENT-003  (search tool, REQ-AGENT-013)
              ├─ Competition          (parallel)    REQ-AGENT-004  (search tool, REQ-AGENT-013)
              └─ Relevance            (parallel)    REQ-AGENT-006
              Startup Generator                     REQ-AGENT-005
              scoring engine (plain code)           REQ-SCORE-001
```

Market Analysis, Competition, and Relevance depend only on the Research Analyst and Problem Discovery outputs, so they run in parallel. The Startup Generator waits for Market Analysis, Competition, and Relevance because it uses all three (constraints and effort from Relevance shape NextSteps and KeyRisks).

## Choreography

```text
Cron (OpenAlex / arXiv)
  → collector Workflow (pagination, dedup, source_record)
      → queue document.ingest (license-gated PDF, REQ-DATA-004) and/or publication.embed
          → document-processing Queue consumer (optional)
          → embedding Worker
          → queue publication.triage
              → Triage Worker (rules, then cheap model)
                  → if accepted: queue publication.extract
                      → Extraction Worker → 0..N candidates
                          → for each candidate: queue candidate.run
                              → one Cloudflare Workflow per candidate
                                 (agents + scoring; see diagram above)
```

- Publication-level steps (triage, extraction) are Queue consumers in `apps/pipeline`, not the per-candidate Workflow.
- Extraction enqueues at most `extraction.max_candidates_per_publication` `candidate.run` messages.
- The Workflow step names match `pipeline_step.step_name` in [schema migration 0001](schema-migration-0001.md): `research_analyst`, `problem_discovery`, `market_analysis`, `competition`, `relevance`, `startup_generator`, `scoring`.
- Idempotency key for a queue message is `message_id` in `queue_message_log`. Idempotency key for a Workflow step is `(pipeline_run_id, step_name)`.

## Scheduled ingestion

- A cron trigger starts one run per source (`0 6 * * *` OpenAlex, `30 7 * * *` arXiv, UTC). The run row stores its window start, which is the end of the last `succeeded` run minus `ingestion.overlap_days`, or `ingestion.backfill_days` back for a first run, and never further back than `ingestion.backfill_days`.
- Each page is one `source.fetch_page` message. The consumer claims the message in `queue_message_log`, fetches the page, stores it, and writes the counts, the next page cursor, and the message state in one batch. A repeated delivery finds the message `completed` and does nothing.
- The next page is queued before that batch is written. If the Worker stops in between, the same page is stored again, which changes nothing, and the next page is the same message.
- The last page closes the run: `succeeded`, or `partial` when an item failed or the page cap was reached. A run that ends `partial` or `failed` stores no window end, so the next run covers the same days again. Stored publications are not duplicated (REQ-DATA-001, REQ-DATA-002).
- After a page is stored, each publication with a PDF URL and a license that allows storage gets a `document.ingest` message, unless it has a document or a finished message. The consumer takes the URL and license from the stored source record, fetches the file with the PDF fetcher, and stores it under `pdfs/<sha256>.pdf` in R2 with a `document` row. A file that can never work (not a PDF, too large, refused URL, 404) completes the message with the reason in `last_error`; a timeout or 5xx is retried and can be dead-lettered. A PDF problem never fails an ingestion run.
- A message that fails its retries goes to the dead-letter queue. The dead-letter consumer marks it, counts it in its run, and closes that run as `failed`. Replaying the message reopens the run, and the page can finish it.
- A new start is skipped while the previous run of that source is `running`, until it is older than `ingestion.run_timeout_hours`.

## State and durability

- Each step is a durable step: its output is stored with the run ID before the next step starts (REQ-AGENT-007). A resumed run skips completed steps.
- Steps pass record IDs, not large payloads. Each step loads its inputs from storage.
- The candidate is the unit of work. One failed candidate does not stop the other candidates of the same publication.
- `pipeline_step` rows record per-step completion so resume does not invent state.

## Retries and failure

| Failure | Handling |
|---|---|
| Output is correct but wrapped wrongly | Repaired by plain code and validated; no attempt is used (REQ-AGENT-011). |
| Output does not match the contract | Retry with the validation errors, up to three attempts (REQ-AGENT-009). |
| Too many model calls in flight | The call waits for a free slot in the Durable Object semaphore; waiting is not an attempt (REQ-AGENT-012). |
| Evidence quote not found in the input | Treated as invalid output. |
| Provider error, rate limit (429), or timeout | Retry with backoff, honoring `Retry-After`; counts toward the same attempt limit. |
| Daily budget reached | No new runs start; running steps finish (REQ-NFR-005). |
| Final failure | Step marked failed with errors stored; the opportunity is incomplete and not scored (REQ-SCORE-005). |

## Models and prompts

- The model for each agent is configuration, not code. Every call goes through AI Gateway (REQ-NFR-003) and one shared model-call helper (ADR 0003).
- Prompts live in `packages/prompts`, one versioned prompt per agent. The version is stored in the output envelope (see [contract conventions](../agents/contract-conventions.md)).
- Changing a prompt or a model triggers the evals for that agent (REQ-TEST-004).
- Temperature and other sampling settings are part of the model configuration and are versioned with it.

## Admin recovery

A failed or incomplete candidate is rerun by an admin from the first failed step (REQ-ADM-002). A rerun creates a new pipeline run; completed steps are not repeated.

## Human review

The pipeline has no review step. Analysts review scores after scoring, in the dashboard: a review annotates the score and never changes it or triggers a rerun (REQ-SCORE-007, ADR 0007). What happened to an opportunity is recorded as a status, separate from the score (REQ-DASH-004).
