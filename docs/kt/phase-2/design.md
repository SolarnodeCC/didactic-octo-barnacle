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
| `packages/vector-store` (new) | `upsertPublicationVectors`, `deletePublicationVectors`, `searchPublications`, `FakeVectorize` with exact cosine ranking, and the recall-at-10 corpus and evaluator (ADR 0056, ADR 0057). The embedding call itself is `callEmbedding` in `packages/models`, next to `callModel`. The registry rows are read and seeded by the pipeline, which owns the D1 binding; the package takes them as `IndexEntry` values (WP5) |
| `agents/extraction` | `runExtractionStep`: a pure function from input to validated output through `callModel`; an eval command that runs the existing eval runner on `callModel` for the benchmark. `runTriageStep` and `runExtractionStep` live in `apps/pipeline/src/triage/step.ts` and `apps/pipeline/src/extraction/step.ts` instead, on `@roi/prompts` and `@roi/models`, so the Worker bundle stays free of the benchmark command's dependencies (WP6, WP7). The checks they share with the benchmark are in `packages/models` |
| `apps/pipeline` | Consumers for embedding, triage, extraction, and text extraction; the admission cron; the retraction check; budget handling; the thin-slice Workflow with stub steps; run-report fields for processing |
| `apps/api` (new, minimal) | One read-only route for the thin slice (ADR 0058), `GET /api/v1/opportunities/:id`, local and preview only (`apps/api/wrangler.toml`) |
| `infrastructure/cloudflare` | Migrations 0009 to 0015; Workers AI, Vectorize, Workflow, and queue bindings; new crons; bootstrap entries for the new queues and the Vectorize metadata indexes; the price table |

## Queues and message types

The queue layout is ADR 0053. Messages carry IDs only, as today.

| Type | Message ID | Producer | Queue | Consumer |
|---|---|---|---|---|
| `document.extract_text` | `text:<documentId>` | Document consumer, after a PDF is stored | `roi-texts-<env>` (batch 1) | Text consumer |
| `publication.embed` | `embed:<publicationId>:<indexId>` | Page consumer, for each new or changed publication; backfill command | `roi-embeddings-<env>` (batch up to 50) | Embedding consumer |
| `publication.triage` | `triage:<publicationId>` | Page consumer, for each new publication | `roi-models-<env>` (batch 1, concurrency 8) | Triage consumer |
| `publication.extract` | `extract:<publicationId>` | Admission cron | `roi-models-<env>` | Extraction consumer |
| `candidate.run` | `candidate:<candidateId>` | The `slice` command, thin slice only in phase 2 (ADR 0117) | `roi-models-<env>` | Starts one candidate Workflow |

Every consumer uses the existing claim in `queue_message_log`, the growing retry delay of ADR 0045, and its queue's dead-letter queue. A message type joins `QueueMessageTypeSchema` in the pull request that adds its producer and consumer.

## Model calls

`callModel` is the only way to call a model, and `callEmbedding` the only way to embed (REQ-NFR-003 AC1). Both check the budget at the first attempt, call Workers AI through the environment's AI Gateway, retry, and write one `model_call` row per attempt. The details are in [model calls](model-calls.md).

## Embeddings and search

- The embedding input is the title, a blank line, and the abstract. Publications with no abstract are embedded from the title alone and marked so in `embedding` (REQ-PROC-001 AC1).
- The vector ID is the publication ID, so a repeated message overwrites the same vector. Metadata: `source` (string) and `published_day` (number, `YYYYMMDD`). Vectorize applies a metadata index only to vectors written after the index exists, so bootstrap creates both indexes before the first write (REQ-PROC-002 AC1).
- The embedding consumer embeds a whole batch in one call, writes the vectors, then the `embedding` rows and message states in one D1 batch.
- `searchPublications(query, { source?, from?, to?, topK })` embeds the query with the current index's model, queries the current index with the filters, and returns publication IDs with scores, best first (REQ-PROC-003 AC1, AC2). Agents in phase 3 and the opportunity search in phase 4 call this function.
- **As built (WP5):**
  - The page consumer sends `publication.embed` (message ID `embed:<publicationId>:<indexId>`, `Ids.IndexId`) for each created publication and each index of the registry, where `processing.enabled` is on.
  - `handleEmbeddingMessages` (`apps/pipeline/src/embedding/consumer.ts`) takes the whole delivery batch and calls `callEmbedding` once per index. It skips publications already embedded in that index, and retracted ones.
  - A budget refusal, a paused step, or a failed call completes the messages and records step `embedding` in `redrive`. The admission cron re-drives them to the current index (`redriveEmbedding`), and the recovery cron probes the step.
  - The registry is read by `registryIndexes` (`apps/pipeline/src/store/embedding-index-repo.ts`). While it is empty, that function seeds the first row, `idx_bge_base_768`: `roi-publications-<env>`, bound as `PUBLICATION_VECTORS`, current. The seed is in code because a migration does not know the environment.
  - The retraction sweep deletes the vectors of flagged publications from every bound index, before it stamps them.
- **Model change** (REQ-PROC-001 AC2, ADR 0056): a new index and its binding are added, the backfill command queues `publication.embed` for every publication against the new index, and search keeps reading the current index. When every publication has a vector in the new index, a reviewed configuration change marks it current. The old binding is removed in the next release.
- **Backfill as built (WP5):**
  - A reviewed migration adds the new index's registry row, with `backfill_started_at` set and `current` off, and the release binds it as `PUBLICATION_VECTORS_NEXT`.
  - The admission cron then continues the backfill each day with `continueEmbeddingBackfills` (`apps/pipeline/src/embedding/backfill.ts`). It queues up to 5,000 publications without a vector in that index, and sends again a message that ended without one.
  - When every publication that is not retracted has its vector, it sets `backfill_done_at`. The run is a `processing_run` of kind `backfill` with ID `bf_<indexId>`.
  - `searchCurrentIndex` reads only the index marked `current`.

## Triage

1. **Rules, no model** (REQ-PROC-006 AC1): `retracted` from `publication.retracted`, `incomplete` from `publication.completeness`, and `out-of-scope` when none of the stored topics and categories is in the ingestion scope (`isArxivCategoryInScope`, `isOpenAlexTopicsInScope`). The cross-industry categories (`cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` and their OpenAlex topics) are in scope, as in ingestion; the Relevance agent assigns the industry later (ADR 0038). The decision row is written with that reason. Code: `apps/pipeline/src/triage/`.
2. **Model**: `runTriageStep` reads the title and abstract inside delimiters and returns the five signals and notes (REQ-PROC-008 AC1). It runs in the daily processing run of the UTC day it is handled. A step refused by the budget completes its message as `budget-deferred`, and one that fails every attempt completes it with the reason; neither writes a decision, and the daily re-drive picks them up (ADR 0063).
3. **Code**: `decideTriage` sets the score. A publication that fails the signal rule is stored as `low-score`. One that passes is stored as `awaiting-admission` (REQ-PROC-008 AC2, AC3).
4. **Admission cron** (ADR 0055), daily after ingestion:
   - It takes the decisions still `awaiting-admission` from the last `triage.admission_pool_days`.
   - It ranks them with `admitWithinDailyLimit`, using the limit minus the publications already admitted that UTC day (REQ-PROC-008 AC4).
   - It leaves out a publication dated after the day of the run. The 613 OpenAlex works with a future date that were stored before ADR 0068 stay in the database, and a date in the future is no sign that a work is recent.
   - It admits a ranked publication only when it is ready: text stored or failed, no license-allowed PDF, or the document message finished without a document (completed, failed after its retries as `unavailable`, or dead-lettered). After `extraction.full_text_wait_hours` every publication is ready. A publication that is not ready keeps its rank, its empty reason, and its place in the pool, and uses none of the limit (REQ-PROC-011, ADR 0065).
   - It sets the admitted to `accepted` with `admitted_on`. After its batch commits, `queueAdmittedExtractions` (`apps/pipeline/src/extraction/queue-extractions.ts`) sends `publication.extract` for every accepted publication that has no `extraction_result` and no `extract:` message yet. That covers today's admitted, and any whose message was lost in a stop between the commit and the send or while processing was off. It sends nothing while the day's budget is used up (WP7).
   - With the day's budget used up it admits nobody (REQ-NFR-005 AC2). The counts (admitted, deferred for the limit, not ready, admitted on the abstract after the wait, left the pool, dated after the run day) go into the day's processing run. Code: `apps/pipeline/src/triage/admission.ts`.
   - The rest get `daily-limit`, stay in the pool, and are considered again the next day. A decision that leaves the pool keeps `daily-limit` as its final reason.
   - The run is keyed by its day, so a repeated trigger admits nothing twice.

## Extraction

- The consumer loads the publication and, when the document has `text-extracted`, the full text. Otherwise it uses the abstract. Full text is cut at `extraction.full_text_max_chars`, and the quote check runs on exactly the text that was sent (REQ-DATA-006 AC3, REQ-PROC-009 AC3).
- `runExtractionStep` returns the candidates, `Confidence`, and `Notes`. With abstract-only input, `Confidence` is capped at 0.7 (contract conventions).
- The pipeline gives each candidate an ID from `deps.NewId` and writes one `extraction_result` row and zero to `extraction.max_candidates_per_publication` `candidate` rows in one batch (REQ-PROC-004 AC1, AC2).
- Outside the thin slice, phase 2 queues no `candidate.run`. Candidates wait for the phase 3 agents.
- Implementation (WP7): `handleExtraction` in `apps/pipeline/src/extraction/extraction-consumer.ts`.
  - It extracts only a publication whose triage decision is `accepted`, and completes with `already extracted` when a result exists.
  - A stored text that cannot be read throws, so the queue retries the message.
  - Each kept quote is stored as the matched source span (ADR 0064). Candidate rows are inserted only when this message's result row is the one stored, so a parallel duplicate adds none (REQ-PROC-010 AC7).
  - A budget-refused, paused, or failed step records the failure in `redrive` with step `extraction`, as triage does. The daily re-drive picks it up (see [Recovery](#recovery)).
  - The day's run counts `Extracted`, `ExtractedOnFullText`, `ExtractedOnAbstract`, `ExtractedWithoutCandidate`, `CandidatesStored`, `CandidatesDropped`, `DroppedQuote`, `DroppedGenericCustomer`, and the report-only `CustomerQuoteNoOverlap` (ADR 0066). They are added inside the database, so parallel consumers never overwrite each other's counts.

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
- As built (ADR 0113, `apps/pipeline/src/budget/`):
  - Each step cost is the benchmark cost per item, with extraction priced at the full-text input. Once 20 items over the 7 complete days before are recorded, the measured cost per item replaces it.
  - The limit is computed on the first use of a day, stored in `budget_day.limit_amount`, and logged as `budget.limit`.
  - The call that reaches the limit sets `stopped_at`; the first refusal after it sets `alerted_at` and sends the alert.
- When `budget_day.spent` reaches the limit, `callModel` refuses new steps:
  - The triage, embedding, and extraction consumers complete those messages as `budget-deferred`, and the admission cron queues them again the next day (ADR 0063).
  - The admission cron admits nothing.
  - A `budget-stop` alert is sent once that day (REQ-NFR-005 AC2).
- The overshoot is at most the steps already started: model-queue concurrency × `model.max_attempts` × the dearest call.
- Each processing run report holds the cost per publication and per opportunity (candidate) for its day (REQ-NFR-005 AC3).
  - As built (ADR 0114, `report/processing-report.ts`): the admission cron first closes the earlier days' `daily` runs (`partial` with failed-final items) and stores each finished run's `ProcessingReport` in `processing_run.report_json`.
  - The total is every call of the run; it is divided by the distinct publications with a call and by the candidates written.

## Quality section

- When the admission cron reports a `daily` run, `report/quality.ts` adds its quality section from stored rows and makes no model call (REQ-NFR-023, ADR 0071, ADR 0115). It reports rates, histograms, counts per industry, and near-duplicates.
- Each rate is stored in `quality_metric` and compared with its median over `monitor.baseline_days`. A drift sends one `quality-drift` alert per metric and day; there are none during start-up.

## Recovery

- The admission cron re-drives failed work after the retraction sweep and before it admits new publications (ADR 0063, REQ-PROC-010):
  - a transient failure (`provider-error`, `budget-exhausted`, dead letter) once a day, up to `recovery.max_redrives`;
  - a content failure (`invalid-output`) once on the next day, then only after the step's model or prompt version changed;
  - at most `recovery.max_redrives_per_day` items, and re-driven extractions count toward the daily limit.
- A step that uses up its re-drives is marked `failed-final` in `redrive` and listed in the run report.
- Dead letters are replayed after `recovery.dead_letter_replay_hours`, at most twice per message ID (REQ-DATA-012).
- The breaker pauses a step when more than `recovery.breaker_failure_share` of its calls in the last hour end in `provider-error`, once the hour holds at least `recovery.breaker_min_calls` calls. The consumer completes new messages as `budget-deferred` without a call, one `step-paused` alert is sent, and a probe every 30 minutes resumes the step.
- **As built for triage (WP6, `apps/pipeline/src/recovery/`):**
  - The triage consumer records each failure in `redrive` in the batch that completes its message: `provider-error`, `budget-exhausted`, and a paused step as transient, `invalid-output` as content, with the model and prompt version of the failed attempt.
  - The admission cron re-drives a publication that still has no decision by reopening its `triage:` message and sending it again. Nothing is re-driven while the step is paused or the day's budget is used up, so waiting uses up no re-drive.
  - Dead letters of every message type are replayed by the recovery cron (`*/30 * * * *`), not re-driven. It also runs the breaker probe: one triage call on a fixed probe text, with no stored publication.
- **Extended to extraction (WP7):**
  - `redriveTriage` and `redriveExtraction` share one algorithm, `redriveStep`. Extraction re-drives a publication that still has no `extraction_result` by reopening its `extract:` message. Its run-report counts carry the prefix `Extraction`, for example `ExtractionRedriven` and `ExtractionFailedFinal`.
  - The admission cron runs the triage re-drive, then the extraction re-drive, then the admission, then `queueAdmittedExtractions`.
  - The admission takes the extractions re-driven that day from the day's limit and counts them as `RedrivenExtractionsCounted` (REQ-PROC-010 AC3). The `recovery.max_redrives_per_day` cap is shared by both steps.
  - The recovery cron probes each paused step with `probeStep`. The extraction probe runs `runExtractionStep` on the same fixed probe text and stores nothing.
  - Run counts are added inside the database with `json_set` (`addRunCounts`, `addRunCountStatements`), so the crons and the parallel consumers never overwrite each other's counts.

## Retractions

- Ingestion already sets `publication.retracted` and never clears it.
- The weekly retraction check (`0 8 * * 1`) asks OpenAlex for retracted works, and arXiv for withdrawals, among the stored publications of the last `retraction.lookback_days` (30 days, ADR 0061), and sets the flag (REQ-DATA-008 AC1).
- **Check as built (WP8, ADR 0112):** `startRetractionCheck` and `handleRetractionCheckPage` are in `apps/pipeline/src/retraction/check.ts`.
  - OpenAlex list endpoints leave retracted works out unless the filter asks for them, so ingestion seldom sees a retraction. The check asks OpenAlex for the retracted works of the window, with the ingestion scope and `is_retracted:true`, paged by number, and flags the stored ones.
  - It looks up the stored arXiv preprints of the window by `id_list`, 100 a page.
  - Each page is a `retraction.check_page` message on the page queue. The run has kind `retraction-check` and ID `rc_<day>`, and counts `OpenAlexRetractedSeen`, `OpenAlexFlagged`, `ArxivChecked`, and `ArxivFlagged`.
- The daily admission cron starts with a sweep of flagged publications not yet handled. It deletes their vectors from every index, hides their candidates and, from migration 0015 (WP10), their opportunities with `hidden_reason = retracted`, and stamps `retraction_handled_at` (REQ-DATA-008 AC2, AC3; REQ-PROC-002 AC2).
- **As built (WP8):** `sweepRetractions` in `apps/pipeline/src/retraction/sweep.ts` runs before the re-drives.
  - It hides the candidates of each flagged publication.
  - It decides a triage decision still awaiting admission as `retracted`, so the publication is never admitted.
  - It stamps `retraction_handled_at`, so a repeated sweep changes nothing.
  - It counts `RetractionsHandled`, `CandidatesHidden`, and `DecisionsWithdrawn` in the day's run.
- A publication retracted after its admission goes no further: `queueAdmittedExtractions` and the re-drives skip it, and the extraction consumer completes its message as `retracted` without a model call.
- WP8 was built before WP5, so the vector part moves to WP5. The embedding consumer never embeds a retracted publication, and the sweep deletes the vectors of flagged publications from every index (REQ-DATA-008 AC3, REQ-PROC-002 AC2).

## Thin slice

- `pnpm --filter @roi/pipeline slice` runs the slice in Node with a local SQLite database, the real consumers, and an inline Workflow runner (ADR 0117). The run ingests one fixture publication, triages and extracts it with recorded model responses, and starts one candidate Workflow (REQ-PROC-007 AC1, AC2).
- The candidate Workflow has the step names of [orchestration](../architecture/orchestration.md). Each step is a stub that returns the matching section of the [examples](../examples/README.md) inside a valid envelope, so phase 3 replaces a step and nothing else (AC3, AC4).
- The `scoring` step applies a placeholder score model (`score_model.version = placeholder-0`: the rules of ADR 0005 with equal weights) and writes `score`; `candidate.run` writes the `opportunity` (`apps/pipeline/src/candidate/`).
- The read route returns the opportunity with its publication, candidate, agent outputs, and score. The slice writes a processing run report.

## Throughput

The largest measured day is about 4,600 publications, and most reach the triage model. Triage runs on Gemma at the default 300 requests a minute; the paid extraction model allows 20, so extraction messages are sent 3 s apart (`model.extraction_requests_per_minute`). The load test of ADR 0118 (`pnpm --filter @roi/pipeline load`) runs that day through the real consumers on a virtual clock. Every publication is triaged by 07:35, before the 11:00 admission run, and the 100 admitted are extracted by 11:06 (REQ-NFR-010). The staging days confirm the times.
