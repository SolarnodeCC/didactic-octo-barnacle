---
title: Phase 2 design
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-DATA-006, REQ-DATA-008, REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-PROC-004, REQ-PROC-005, REQ-PROC-006, REQ-PROC-007, REQ-PROC-008, REQ-PROC-009, REQ-NFR-003, REQ-NFR-005, REQ-NFR-010, REQ-NFR-011]
---

# Phase 2 design

Tables, configuration keys, and bindings are in [schema](schema.md). Behavior that is already decided in [orchestration](../architecture/orchestration.md), the [contract conventions](../agents/contract-conventions.md), [triage](../agents/triage.md), and [opportunity extraction](../agents/opportunity-extraction.md) is not repeated here.

## Components

| Package | Phase 2 additions |
|---|---|
| `packages/models` | `MoneySchema`; schemas for the model-call record, processing run, triage decision row, extraction result, and candidate row; the new queue message types and `CandidateId` in the message IDs; the `callModel` helper (ADR 0003) and its Workers AI and budget interfaces |
| `packages/prompts` (new) | One versioned prompt per step (`triage@2`, `extraction@4`, ADR 0076, ADR 0085, ADR 0090), the sampling settings that go with it, and the delimiters that mark publication text as data |
| `packages/vector-store` (new) | `embedTexts`, `upsertPublicationVectors`, `deletePublicationVectors`, `searchPublications`, the index registry, and the recall-at-10 corpus and evaluator (ADR 0056, ADR 0057) |
| `agents/extraction` | `runExtractionStep`: a pure function from input to validated output through `callModel`; an eval command that runs the existing eval runner on `callModel` for the benchmark. `runTriageStep` lives in `apps/pipeline/src/triage/step.ts` instead, on `@roi/prompts` and `@roi/models`, so the Worker bundle stays free of the benchmark command's dependencies (WP6) |
| `apps/pipeline` | Consumers for embedding, triage, extraction, and text extraction; the admission cron; the retraction check; budget handling; the thin-slice Workflow with stub steps; run-report fields for processing |
| `apps/api` (new, minimal) | One read-only route for the thin slice (ADR 0058) |
| `infrastructure/cloudflare` | Migrations 0009, 0010, and 0011; Workers AI, Vectorize, Workflow, and queue bindings; new crons; bootstrap entries for the new queues and the Vectorize metadata indexes; the price table |

## Queues and message types

The queue layout is ADR 0053. Messages carry IDs only, as today.

| Type | Message ID | Producer | Queue | Consumer |
|---|---|---|---|---|
| `document.extract_text` | `text:<documentId>` | Document consumer, after a PDF is stored | `roi-texts-<env>` (batch 1) | Text consumer |
| `publication.embed` | `embed:<publicationId>:<indexId>` | Page consumer, for each new or changed publication; backfill command | `roi-embeddings-<env>` (batch up to 50) | Embedding consumer |
| `publication.triage` | `triage:<publicationId>` | Page consumer, for each new publication | `roi-models-<env>` (batch 1, concurrency 8) | Triage consumer |
| `publication.extract` | `extract:<publicationId>` | Admission cron | `roi-models-<env>` | Extraction consumer |
| `candidate.run` | `candidate:<candidateId>` | Extraction consumer, thin slice only in phase 2 | `roi-models-<env>` | Starts one candidate Workflow |

Every consumer uses the existing claim in `queue_message_log`, the growing retry delay of ADR 0045, and its queue's dead-letter queue. A message type joins `QueueMessageTypeSchema` in the pull request that adds its producer and consumer.

## Model calls

`callModel` is the only way to call a model (REQ-NFR-003 AC1). It takes the step, the agent when one applies, the run, the model configuration, the prompt, the contract schema, and the text the output must quote from. For each call it:

1. Checks the daily budget at the first attempt of a step, never on a retry, so a step that has started finishes (REQ-NFR-005 AC2).
2. Calls the Workers AI binding with the environment's AI Gateway and request metadata: run ID, step, and agent (REQ-NFR-003 AC2, ADR 0054).
3. Applies the two code repairs (`repairModelOutput`), validates the contract, and checks every quote against the input text. A failure is retried with the validation errors, up to `model.max_attempts`. A 429 or 5xx is retried with backoff and `Retry-After` and counts toward the same limit.
4. Writes one `model_call` row per attempt: input tokens with the cached part, output tokens, latency, cost as `Money`, `price_table_version`, `estimated`, and the outcome (`ok`, `invalid-output`, `provider-error`). The row never holds prompt or publication text (REQ-NFR-011).
5. Adds the cost to `budget_day` in the same batch.

Implementation (WP2): `callModel` in `packages/models/src/call-model.ts`, with the binding interface and error classes in `workers-ai.ts` and `FakeWorkersAi` for tests. The D1 store that writes `model_call` and `budget_day` in one batch is `apps/pipeline/src/store/model-usage.ts`. Further rules:

- The price tables are `infrastructure/cloudflare/prices/<version>.json`: list prices in US dollars and the euro exchange rate of that day. A model whose list price has a cached-input price carries it as `CachedInputUsdPerMillionTokens`; the cost is uncached input tokens at the input price, plus cached input tokens (`usage.prompt_tokens_details.cached_tokens`) at the cached price, plus output tokens at the output price (ADR 0078). A published table is never changed; new prices get a new version. Costs are recorded in euro, the currency of the daily budget, rounded to 1e-8. A model with no price in the configured table is refused before the first call, so every record carries a cost.
- The binding returns no gateway cost, so every record is `estimated` with the table version (ADR 0054). Checked on 2026-11-10 with two `extraction@2` calls of `deepseek-v4.1-flash-1017` on golden-set entry `gs-extraction-001`, through the `AI` binding (`wrangler dev`, where the AI binding always runs remotely) and the gateway `roi-staging`:
  - The response has `id`, `object`, `created`, `model`, `choices`, and `usage`, and no cost field.
  - `usage.prompt_tokens_details.cached_tokens` is present (704 of 828 input tokens on both calls), so `CachedInputTokens` comes from the binding as it does from the REST API (ADR 0078).
  - The estimate of each record equals the cost the gateway logged for the same call (USD 0.0022986240 and 0.0018582240), and `aiGatewayLogId` gives the gateway log ID that `gateway_request_id` stores, so a later job can match estimated records to the gateway logs by request ID (ADR 0054).
  - The first `evals` calls repeat this check (ADR 0078).
- A 429, a 5xx, or an error with no status is retried with exponential backoff from 500 ms, capped at 30 s, or after `Retry-After` when that is longer. Any other 4xx, such as 410 for a deprecated model, fails the step at once.
- A retry after invalid output adds the previous answer and the validation errors to the messages (REQ-AGENT-009 AC1).

In phase 2 the model queue's concurrency (8, equal to `model.semaphore_max`) is the global limit on calls in flight. The Durable Object semaphore of ADR 0017 arrives in phase 3, when candidate Workflows also call models.

## Embeddings and search

- The embedding input is the title, a blank line, and the abstract. Publications with no abstract are embedded from the title alone and marked so in `embedding` (REQ-PROC-001 AC1).
- The vector ID is the publication ID, so a repeated message overwrites the same vector. Metadata: `source` (string) and `published_day` (number, `YYYYMMDD`). Vectorize applies a metadata index only to vectors written after the index exists, so bootstrap creates both indexes before the first write (REQ-PROC-002 AC1).
- The embedding consumer embeds a whole batch in one call, writes the vectors, then the `embedding` rows and message states in one D1 batch.
- `searchPublications(query, { source?, from?, to?, topK })` embeds the query with the current index's model, queries the current index with the filters, and returns publication IDs with scores, best first (REQ-PROC-003 AC1, AC2). Agents in phase 3 and the opportunity search in phase 4 call this function.
- **Model change** (REQ-PROC-001 AC2, ADR 0056): a new index and its binding are added, the backfill command queues `publication.embed` for every publication against the new index, and search keeps reading the current index. When every publication has a vector in the new index, a reviewed configuration change marks it current. The old binding is removed in the next release.

## Triage

1. **Rules, no model** (REQ-PROC-006 AC1): `retracted` from `publication.retracted`, `incomplete` from `publication.completeness`, and `out-of-scope` when none of the stored topics and categories is in the ingestion scope (`isArxivCategoryInScope`, `isOpenAlexTopicsInScope`). The cross-industry categories (`cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` and their OpenAlex topics) are in scope, as in ingestion; the Relevance agent assigns the industry later (ADR 0038). The decision row is written with that reason. Code: `apps/pipeline/src/triage/`.
2. **Model**: `runTriageStep` reads the title and abstract inside delimiters and returns the five signals and notes (REQ-PROC-008 AC1). It runs in the daily processing run of the UTC day it is handled. A step refused by the budget completes its message as `budget-deferred`, and one that fails every attempt completes it with the reason; neither writes a decision, and the daily re-drive picks them up (ADR 0063).
3. **Code**: `decideTriage` sets the score. A publication that fails the signal rule is stored as `low-score`. One that passes is stored as `awaiting-admission` (REQ-PROC-008 AC2, AC3).
4. **Admission cron** (ADR 0055), daily after ingestion:
   - It takes the decisions still `awaiting-admission` from the last `triage.admission_pool_days`.
   - It ranks them with `admitWithinDailyLimit`, using the limit minus the publications already admitted that UTC day (REQ-PROC-008 AC4).
   - It leaves out a publication dated after the day of the run. The 613 OpenAlex works with a future date that were stored before ADR 0068 stay in the database, and a date in the future is no sign that a work is recent.
   - It admits a ranked publication only when it is ready: text stored or failed, no license-allowed PDF, or the document message finished without a document (completed, failed after its retries as `unavailable`, or dead-lettered). After `extraction.full_text_wait_hours` every publication is ready. A publication that is not ready keeps its rank, its empty reason, and its place in the pool, and uses none of the limit (REQ-PROC-011, ADR 0065).
   - It sets the admitted to `accepted` with `admitted_on`. The `publication.extract` message for them comes with WP7, together with its consumer; until then the admission only records them.
   - With the day's budget used up it admits nobody (REQ-NFR-005 AC2). The counts (admitted, deferred for the limit, not ready, admitted on the abstract after the wait, left the pool, dated after the run day) go into the day's processing run. Code: `apps/pipeline/src/triage/admission.ts`.
   - The rest get `daily-limit`, stay in the pool, and are considered again the next day. A decision that leaves the pool keeps `daily-limit` as its final reason.
   - The run is keyed by its day, so a repeated trigger admits nothing twice.

## Extraction

- The consumer loads the publication and, when the document has `text-extracted`, the full text. Otherwise it uses the abstract. Full text is cut at `extraction.full_text_max_chars`, and the quote check runs on exactly the text that was sent (REQ-DATA-006 AC3, REQ-PROC-009 AC3).
- `runExtractionStep` returns the candidates, `Confidence`, and `Notes`. With abstract-only input, `Confidence` is capped at 0.7 (contract conventions).
- The pipeline gives each candidate an ID from `deps.NewId` and writes one `extraction_result` row and zero to `extraction.max_candidates_per_publication` `candidate` rows in one batch (REQ-PROC-004 AC1, AC2).
- Outside the thin slice, phase 2 queues no `candidate.run`. Candidates wait for the phase 3 agents.

## Full text

- The document consumer queues `document.extract_text` (message ID `text:<documentId>`) after it stores a PDF, where `processing.enabled` is on. Each ingestion start also queues up to `text.backfill_per_run` stored PDFs that have no text yet, so PDFs stored before the switch, or whose message was lost, get their text too.
- The text consumer (`apps/pipeline/src/queue/text-extract.ts`) reads one file per invocation from `roi-texts-<env>`:
  - it checks the object size in R2 against `text.max_pdf_bytes` before it loads the file;
  - it opens the file with unpdf and refuses files over `text.max_pages` before it reads a page;
  - it reads the pages one at a time, releasing each, and writes the text to R2 under `texts/<documentId>.txt` with the PDF's license;
  - it sets `extracted_text_r2_key`, `extractor_version` (`unpdf@<version>`), and status `text-extracted`.
- A limit, a file that does not parse, or fewer than `text.min_chars` characters of text (a scan) sets `text-failed` with a short `failure_reason` (`too-large`, `too-many-pages`, `unreadable`, `no-text`, `missing`) and completes the message, because a retry cannot change it. The publication keeps using its abstract (REQ-DATA-006 AC1, AC2; ADR 0009). A storage or database error is retried.
- **Limits from the WP4 measurement.** `pnpm --filter @roi/pipeline measure:pdf-text` extracts generated fixture PDFs (two columns with equations, a scan, a corrupt file, long files, and large files whose size is an image), each in its own Node process, and reports the peak resident memory above a baseline process that only loads unpdf. On Node 24 (21 November 2026), with run-to-run noise of about 10 MiB:

| Fixture | File | Pages | Peak above baseline |
|---|---|---|---|
| Two columns with equations, scan, corrupt | under 0.1 MiB | 1 to 2 | 14 to 28 MiB |
| 100 text-dense pages (400,000 characters) | 0.45 MiB | 100 | 55 MiB |
| 300 text-dense pages (1.2 million characters) | 1.35 MiB | 300 | 107 to 117 MiB |
| One large image | 25 MiB | 3 | 56 to 66 MiB |
| One large image | 50 MiB | 3 | 91 to 101 MiB |
| 20 MiB image and 100 text-dense pages | 20.45 MiB | 101 | 74 MiB |

Memory grows with about twice the file size and with the amount of text. `text.max_pdf_bytes` of 20 MiB and `text.max_pages` of 100 keep the worst accepted file near 75 MiB above the runtime, inside the 128 MB isolate. A research paper has 10 to 40 pages, so the page limit rarely bites. The same five fixtures extract correctly in local `workerd`; staging confirms the memory under the real isolate limit (WP4 exit).

## Budget

- `budget.daily_eur` per environment. Before calibration it is the sum of the expected daily triage calls × the triage cost, the daily extraction limit × the extraction cost, and the expected daily embeddings × the embedding cost, times `budget.phase2_multiplier` (REQ-NFR-005 AC1, ADR 0059). `budget.expected_daily_triaged` and `budget.expected_daily_embeddings` come from the measured daily volume.
- When `budget_day.spent` reaches the limit, `callModel` refuses new steps:
  - The triage, embedding, and extraction consumers complete those messages as `budget-deferred`, and the admission cron queues them again the next day (ADR 0063).
  - The admission cron admits nothing.
  - A `budget-stop` alert is sent once that day (REQ-NFR-005 AC2).
- The overshoot is at most the steps already started: model-queue concurrency × `model.max_attempts` × the dearest call.
- Each processing run report holds the cost per publication and per opportunity (candidate) for its day (REQ-NFR-005 AC3).

## Recovery

- The admission cron re-drives failed work after the retraction sweep and before it admits new publications (ADR 0063, REQ-PROC-010):
  - a transient failure (`provider-error`, `budget-exhausted`, dead letter) once a day, up to `recovery.max_redrives`;
  - a content failure (`invalid-output`) once on the next day, then only after the step's model or prompt version changed;
  - at most `recovery.max_redrives_per_day` items, and re-driven extractions count toward the daily limit.
- A step that uses up its re-drives is marked `failed-final` in `redrive` and listed in the run report.
- Dead letters are replayed after `recovery.dead_letter_replay_hours`, at most twice per message ID (REQ-DATA-012).
- The breaker pauses a step when more than `recovery.breaker_failure_share` of its calls in the last hour end in `provider-error`. The consumer completes new messages as `budget-deferred` without a call, one `step-paused` alert is sent, and a probe every 30 minutes resumes the step.

## Retractions

- Ingestion already sets `publication.retracted` and never clears it.
- The weekly retraction check (`0 8 * * 1`) asks OpenAlex for retracted works, and arXiv for withdrawals, among the stored publications of the last `retraction.lookback_days` (30 days, ADR 0061), and sets the flag (REQ-DATA-008 AC1).
- The daily admission cron starts with a sweep of flagged publications not yet handled. It deletes their vectors from every index, hides their candidates and, from migration 0011, their opportunities with `hidden_reason = retracted`, and stamps `retraction_handled_at` (REQ-DATA-008 AC2, AC3; REQ-PROC-002 AC2).

## Thin slice

- `pnpm --filter @roi/pipeline slice` starts `wrangler dev` with local bindings and triggers the `slice` cron. The run ingests one fixture publication, triages and extracts it with recorded model responses, and starts one candidate Workflow (REQ-PROC-007 AC1, AC2).
- The candidate Workflow has the step names of [orchestration](../architecture/orchestration.md). Each step is a stub that returns the matching section of the [examples](../examples/README.md) inside a valid envelope, so phase 3 replaces a step and nothing else (AC3, AC4).
- The `scoring` step applies a placeholder score model (`score_model.version = placeholder-0`, equal weights) and writes `opportunity` and `score`.
- The read route returns the opportunity with its publication, candidate, agent outputs, and score. The slice writes a processing run report.

## Throughput

The largest measured day is about 4,600 publications. The ingestion filters of ADR 0041 and ADR 0048 make most of them in scope, so most reach the triage model. At about 20 requests per minute per paid model ([benchmark plan](../test/model-benchmark-plan.md)), 4,600 triage calls take about four hours, and 100 extractions well under one. A day therefore finishes before the next run (REQ-NFR-010). WP11 checks this with a load test on recorded fixtures and stubbed models, and on the staging days.
