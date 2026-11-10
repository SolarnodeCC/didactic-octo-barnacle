---
title: Runtime defaults
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-PROC-005, REQ-PROC-006, REQ-AGENT-007, REQ-AGENT-012, REQ-AGENT-013, REQ-DATA-011, REQ-NFR-005]
---

# Runtime defaults

Starter configuration values. Stored as versioned config in `infrastructure/cloudflare`, changed by reviewed pull request. [Orchestration](orchestration.md) describes behavior; this file names the numbers.

## Ingestion and triage

| Key | Default | Notes |
|---|---|---|
| `ingestion.daily_extraction_limit` | `100` | Provisional; see [ingestion scope](../data-sources/ingestion-scope.md) |
| `triage.accept_score_cut` | `0.55` | Inclusive; publications at or above are accepted (REQ-PROC-005). `TriageScore` is true signals divided by five, so three signals give 0.6 and pass, and two give 0.4 (REQ-PROC-008) |
| `triage.required_signals` | `NamedParty`, `StatedHarm` | Both must be true for a publication to be accepted (REQ-PROC-008) |
| `extraction.max_candidates_per_publication` | `3` | Hard cap (REQ-PROC-004) |
| `arxiv.min_request_interval_ms` | `3000` | At most one request per 3 seconds; the next arXiv page is delivered after 3 seconds |
| `ingestion.overlap_days` | `2` | A run starts this many days before the end of the last successful window (REQ-DATA-009) |
| `ingestion.backfill_days` | `14` | A first run fetches this many days (REQ-DATA-009, ADR 0041) |
| `ingestion.max_age_days` | `90` | No window reaches back further, and no run stores a publication dated more than this many days before the day of the run (REQ-DATA-009, ADR 0035, ADR 0041) |
| `ingestion.max_pages_per_run` | `50` | Pages (100 each) one run may fetch; a run that hits the cap is `partial` and the next run continues where it stopped (ADR 0035) |
| `ingestion.run_timeout_hours` | `6` | A run still `running` after this long is closed as `failed` when the next one starts |

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
| `document.ingest` | `1` | Page consumer after the license gate | Document-processing Queue consumer; message ID `document:<publicationId>` |
| `publication.embed` | `1` | Page consumer, when a publication is stored (ADR 0053) | Embedding consumer (`roi-embeddings-<env>`) |
| `publication.triage` | `1` | Page consumer, when a publication is stored; runs in parallel with embedding (ADR 0053) | Triage consumer (`roi-models-<env>`) |
| `publication.extract` | `1` | Daily admission cron, for admitted and re-driven publications (ADR 0055, ADR 0063, ADR 0065) | Extraction consumer (`roi-models-<env>`) |
| `candidate.run` | `1` | Extraction (0..N) | Starts one candidate Workflow |
| `queue.dead_letter` | `1` | Any consumer after max attempts | Automatic replay after `recovery.dead_letter_replay_hours`, at most twice (REQ-DATA-012); admin replay (REQ-DATA-011) |

Payload of every message: `{ schemaVersion, type, ids: { runId?, source?, page?, publicationId?, candidateId?, documentId? }, attempt }`. Large bodies stay in D1/R2; messages carry IDs only, and `packages/models` rejects any other key. A type is added to the `QueueMessageTypeSchema` enum when its producer and consumer exist; `source.fetch_page` is the first. Its message ID is `fetch:<runId>:<page>`, so a page sent twice is one message. The page queue (`roi-publications-<env>`) is consumed one message at a time (`max_batch_size = 1`, `max_concurrency = 1`), so pages are stored in order. `document.ingest` messages have their own queue (`roi-documents-<env>`, binding `DOCUMENT_QUEUE`), consumed in batches of 5 with up to 5 at once (ADR 0047). Both retry three times with a growing delay (ADR 0045) and then move the message to their own dead-letter queue, which the same Worker consumes.

## PDF fetching

| Key | Default | Notes |
|---|---|---|
| `pdf.max_bytes` | `26214400` | 25 MiB; a larger file is refused (REQ-DATA-010 AC4) |
| `http.max_response_bytes` | `16777216` | 16 MiB; the most read from one OpenAlex or arXiv API response (REQ-NFR-021, ADR 0074) |
| `pdf.timeout_ms` | `20000` | One deadline for all redirects and the download |
| `pdf.max_redirects` | `3` | Each redirect target is checked again |
| `pdf.allowed_hosts` | empty | Empty means any public host; a list limits fetching to those hosts and their subdomains (ADR 0029) |

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
| `embedding.batch_size` | `50` | Messages per embedding call |

## Processing (phase 2)

Read by `loadProcessingConfig` in `apps/pipeline/src/processing-config.ts`. Only `processing.enabled` varies per environment, through the Worker variable `PROCESSING_ENABLED`.

| Key | Default | Notes |
|---|---|---|
| `processing.enabled` | `false` | Turns the phase 2 consumers on per environment; an unrecognized value fails the Worker instead of turning processing on |
| `triage.admission_pool_days` | `7` | How long a passing publication waits for admission (ADR 0055) |
| `extraction.full_text_max_chars` | `24000` | Cut before the call; the quote check uses the cut text |
| `retraction.lookback_days` | `30` | How far back the weekly retraction check looks (ADR 0061) |
| `model.price_table_version` | `2026-11-10` | Price table used when the gateway gives no cost (REQ-NFR-011 AC2); it has cached-input prices (ADR 0078) |

## Budgets

| Key | Default | Notes |
|---|---|---|
| `budget.phase2_multiplier` | `1.5` | Margin on the phase 2 budget: (expected daily triage calls × triage cost + daily limit × extraction cost + expected daily embeddings × embedding cost) × multiplier (ADR 0059) |
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
