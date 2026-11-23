---
title: Runtime defaults
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-21
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
| `document.extract_text` | `1` | Document consumer after a PDF is stored, and the text backfill at each ingestion start; only where `processing.enabled` is on (REQ-DATA-006) | Text consumer (`roi-texts-<env>`, binding `TEXT_QUEUE`); message ID `text:<documentId>` |
| `publication.embed` | `1` | Page consumer, when a publication is stored (ADR 0053) | Embedding consumer (`roi-embeddings-<env>`) |
| `publication.triage` | `1` | Page consumer, when a publication is created and `processing.enabled` is on; runs in parallel with embedding (ADR 0053) | Triage consumer (`roi-models-<env>`, binding `MODEL_QUEUE`, one message per invocation and at most 8 at once); message ID `triage:<publicationId>` |
| `publication.extract` | `1` | Daily admission cron, for admitted and re-driven publications, only where `processing.enabled` is on (ADR 0055, ADR 0063, ADR 0065) | Extraction consumer (`roi-models-<env>`, binding `MODEL_QUEUE`); message ID `extract:<publicationId>` |
| `retraction.check_page` | `1` | Weekly retraction check (`0 8 * * 1`), one message per page and source (ADR 0112) | Retraction check on the page queue (`roi-publications-<env>`); message ID `retraction:<runId>:<source>:<page>` |
| `candidate.run` | `1` | Extraction (0..N) | Starts one candidate Workflow |
| `queue.dead_letter` | `1` | Any consumer after max attempts | Automatic replay after `recovery.dead_letter_replay_hours`, at most twice (REQ-DATA-012); admin replay (REQ-DATA-011) |

Payload of every message: `{ schemaVersion, type, ids: { runId?, source?, page?, publicationId?, candidateId?, documentId? }, attempt }`. Large bodies stay in D1/R2; messages carry IDs only, and `packages/models` rejects any other key. A type is added to the `QueueMessageTypeSchema` enum when its producer and consumer exist; `source.fetch_page` is the first. Its message ID is `fetch:<runId>:<page>`, so a page sent twice is one message. The page queue (`roi-publications-<env>`) is consumed one message at a time (`max_batch_size = 1`, `max_concurrency = 1`), so pages are stored in order. `document.ingest` messages have their own queue (`roi-documents-<env>`, binding `DOCUMENT_QUEUE`), consumed in batches of 5 with up to 5 at once (ADR 0047). `document.extract_text` messages have their own queue (`roi-texts-<env>`, binding `TEXT_QUEUE`), one file per invocation with up to 3 at once (ADR 0009, ADR 0053). `publication.triage` and `publication.extract` messages go to `roi-models-<env>` (binding `MODEL_QUEUE`), one per invocation with at most 8 at once, which bounds the model calls in flight (ADR 0053). All five retry three times with a growing delay (ADR 0045) and then move the message to their own dead-letter queue, which the same Worker consumes.

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
| `text.max_pdf_bytes` | `20971520` | 20 MiB; a larger stored PDF is not opened for its text and is marked `text-failed` (ADR 0009). Set from the WP4 measurement in [phase 2 design](../phase-2/design.md#full-text) |
| `text.max_pages` | `100` | A PDF with more pages is marked `text-failed` before any page is read (ADR 0009) |
| `text.min_chars` | `200` | Less text than this, not counting white space, means no usable text layer, as in a scan (ADR 0009) |
| `text.backfill_per_run` | `500` | Stored PDFs without text that each ingestion start queues for extraction |
| `extraction.generic_customer_terms` | `users`, `end users`, `people`, `persons`, `individuals`, `humans`, `everyone`, `society`, `the public` | A `Customer` equal to one of these, after normalisation and without a leading `the`, `all`, `many`, or `most`, fails its candidate (REQ-PROC-009 AC4, ADR 0066). Changes by reviewed pull request |
| `extraction.full_text_wait_hours` | `24` | How long the daily admission waits for a publication's full text before it admits it on the abstract (ADR 0065, REQ-PROC-011) |
| `recovery.max_redrives` | `3` | Re-drives of an item's failed step before it is `failed-final` (ADR 0063) |
| `recovery.max_redrives_per_day` | `20` | Items re-driven a UTC day (ADR 0063) |
| `recovery.dead_letter_replay_hours` | `6` | Delay before a dead letter is replayed, at most twice per message ID (REQ-DATA-012) |
| `recovery.breaker_failure_share` | `0.5` | Share of `provider-error` calls in the last hour that pauses a step (REQ-PROC-010 AC6) |
| `recovery.breaker_min_calls` | `10` | Calls a step needs in that hour before its share is judged (WP6) |
| `retraction.lookback_days` | `30` | How far back the weekly retraction check looks (ADR 0061) |
| `model.price_table_version` | `2026-11-11` | Price table used when the gateway gives no cost (REQ-NFR-011 AC2); it has cached-input prices (ADR 0078) |
| `model.triage` | `@cf/google/gemma-4-26b-a4b-it`, thinking off, prompt `triage@2`, `json-schema` output | Chosen by benchmark round two (ADR 0088); temperature 0 and at most 8192 output tokens come with the prompt version |
| `model.research_analyst` | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, prompt `research-analyst@2`, `json-schema` output | Provisional: one of three runs missed the floor by two entries; reviewed after the first live sample (ADR 0107) |
| `model.problem_discovery` | `@cf/google/gemma-4-26b-a4b-it`, thinking off, prompt `problem-discovery@1`, `json-schema` output | Chosen on the code checks (ADR 0096); final, the fact judge stays report-only (ADR 0111) |
| `model.extraction` | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, prompt `extraction@4`, `json-schema` output | Chosen by benchmark round three (ADR 0091); temperature 0 and at most 8192 output tokens come with the prompt version |
| `model.relevance` | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, prompt `relevance@5`, `json-schema` output | Chosen by analysis round five (ADR 0106); temperature 0 and at most 8192 output tokens come with the prompt version |

## Budgets

| Key | Default | Notes |
|---|---|---|
| `budget.phase2_multiplier` | `1.5` | Margin on the phase 2 budget: (expected daily triage calls × triage cost + daily limit × extraction cost + expected daily embeddings × embedding cost) × multiplier (ADR 0059) |
| `budget.cost_per_opportunity_ceiling_eur` | `2.0` | Until ADR 0023 lock |
| `budget.daily_eur` | `1.0` | Provisional phase 2 value (`BudgetDailyEur`): the ADR 0059 formula on the largest measured day of 4,634 publications with the benchmark costs (triage EUR 0.00008, ADR 0088; extraction EUR 0.00177, ADR 0091; embeddings at USD 0.0666 per million tokens), (0.371 + 0.177 + 0.124) × 1.5 = EUR 1.01. WP9 computes it per environment; the ADR 0023 formula replaces it before phase 4 scoring |

## Schedules (cron)

| Job | Cron (UTC) |
|---|---|
| OpenAlex ingestion | `0 6 * * *` |
| arXiv ingestion | `30 7 * * *` |
| Daily re-drive and admission to extraction | `0 11 * * *` (ADR 0063, ADR 0055) |
| Recovery check: dead-letter replay and breaker probe | `*/30 * * * *` (REQ-DATA-012, REQ-PROC-010) |
| Retraction check | `0 8 * * 1` |
| Retention job | `0 3 * * *` |
| Nightly evals | `0 2 * * *` |
