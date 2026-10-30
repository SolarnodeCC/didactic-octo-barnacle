---
title: Runtime defaults
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-PROC-005, REQ-PROC-006, REQ-AGENT-007, REQ-AGENT-012, REQ-AGENT-013, REQ-DATA-011, REQ-NFR-005]
---

# Runtime defaults

Starter configuration values. Stored as versioned config in `infrastructure/cloudflare`, changed by reviewed pull request. [Orchestration](orchestration.md) describes behavior; this file names the numbers.

## Ingestion and triage

| Key | Default | Notes |
|---|---|---|
| `ingestion.daily_extraction_limit` | `100` | Provisional; see [ingestion scope](../data-sources/ingestion-scope.md) |
| `triage.accept_score_cut` | `0.55` | Inclusive; publications at or above are accepted (REQ-PROC-005) |
| `extraction.max_candidates_per_publication` | `3` | Hard cap (REQ-PROC-004) |
| `arxiv.min_request_interval_ms` | `3000` | At most one request per 3 seconds |

## Pipeline concurrency

| Key | Default | Notes |
|---|---|---|
| `pipeline.max_candidate_workflows` | `10` | Global in-flight candidate Workflows |
| `model.semaphore_max` | `8` | Durable Object semaphore (REQ-AGENT-012, ADR 0017) |
| `model.max_attempts` | `3` | Contract validation retries (REQ-AGENT-009) |
| `search.max_calls_per_agent_run` | `5` | Per Market Analysis or Competition run (REQ-AGENT-013) |
| `search.timeout_ms` | `8000` | Per search call |

## Queue message types

| Type | Schema version | Producer | Consumer |
|---|---|---|---|
| `source.fetch_page` | `1` | Cron / collector Workflow | Collector Worker |
| `document.ingest` | `1` | Collector after license gate | Document-processing Queue consumer |
| `publication.embed` | `1` | Document processing or abstract-only path | Embedding Worker |
| `publication.triage` | `1` | After embed (or abstract ready) | Triage Worker |
| `publication.extract` | `1` | Triage accept | Extraction Worker |
| `candidate.run` | `1` | Extraction (0..N) | Starts one candidate Workflow |
| `queue.dead_letter` | `1` | Any consumer after max attempts | Admin replay (REQ-DATA-011) |

Payload of every message: `{ schemaVersion, type, ids: { publicationId?, candidateId?, documentId? }, attempt }`. Large bodies stay in D1/R2; messages carry IDs only.

## Search tool I/O

```json
{
  "query": "string, 3..300 chars",
  "maxResults": 5,
  "results": [
    { "title": "string", "url": "https://...", "snippet": "string, <=500 chars", "retrievedAt": "ISO-8601" }
  ]
}
```

## Embedding

| Key | Default | Notes |
|---|---|---|
| `embedding.model` | `bge-base-en-v1.5` | Interim; benchmark at phase 2 start (ADR 0010) |
| `embedding.recall_at_10_min` | `0.8` | Phase 2 exit gate |

## Budgets

| Key | Default | Notes |
|---|---|---|
| `budget.phase2_multiplier` | `1.5` | daily_limit × cost_per_publication × multiplier |
| `budget.cost_per_opportunity_ceiling_eur` | `2.0` | Until ADR 0023 lock |
| `budget.daily_eur` | unset | Set by ADR 0023 formula before phase 4 scoring |

## Schedules (cron)

| Job | Cron (UTC) |
|---|---|
| OpenAlex ingestion | `0 6 * * *` |
| arXiv ingestion | `30 7 * * *` |
| Retraction check | `0 8 * * 1` |
| Retention job | `0 3 * * *` |
| Nightly evals | `0 2 * * *` |
