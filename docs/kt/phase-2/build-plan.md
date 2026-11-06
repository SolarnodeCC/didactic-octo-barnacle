---
title: Phase 2 build plan
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-DATA-006, REQ-DATA-008, REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-PROC-004, REQ-PROC-005, REQ-PROC-006, REQ-PROC-007, REQ-PROC-008, REQ-PROC-009, REQ-NFR-003, REQ-NFR-005, REQ-NFR-010, REQ-NFR-011, REQ-TEST-002]
---

# Phase 2 build plan

Twelve work packages. Each is one pull request or a short series, and names its REQ-IDs. Their order and the gates are in [dependencies](dependencies.md). The design is in [design](design.md) and [schema](schema.md). Tests are named after the requirement they verify (`check:traceability`).

| WP | Name | Requirements | Gate |
|---|---|---|---|
| WP0 | Readiness | (documents) | none |
| WP1 | Foundations | REQ-NFR-011 | none: gate-enabling |
| WP2 | Model-call helper | REQ-NFR-003, REQ-NFR-011, REQ-NFR-005, REQ-TEST-002 | none: gate-enabling, stubs only |
| WP3 | Prompts | REQ-PROC-008, REQ-PROC-009, REQ-TEST-002 | none: gate-enabling |
| WP4 | Full text | REQ-DATA-006 | phase 2 start |
| WP5 | Embeddings and search | REQ-PROC-001, REQ-PROC-002, REQ-PROC-003 | phase 2 start |
| WP6 | Triage | REQ-PROC-005, REQ-PROC-006, REQ-PROC-008 | phase 2 start |
| WP7 | Extraction | REQ-PROC-004, REQ-PROC-009 | phase 2 start |
| WP8 | Retractions | REQ-DATA-008, REQ-PROC-002 | phase 2 start |
| WP9 | Budget and cost reporting | REQ-NFR-005 | phase 2 start |
| WP10 | Thin slice | REQ-PROC-007 | phase 2 start |
| WP11 | Throughput and exit | REQ-NFR-010, phase 2 exit | phase 2 start |

## WP0: Readiness

- Re-review and approve `requirements/processing.md` and `requirements/non-functional/platform.md`. REQ-PROC-008 and REQ-PROC-009 were added after their last review.
- Move `agents/triage.md`, `agents/opportunity-extraction.md`, and `agents/contract-conventions.md` from `draft` to `approved`.
- ADRs 0053 to 0061 are accepted, and OQ-041, OQ-042, and OQ-043 are answered (ADR 0059, 0060, 0061).
- **Exit:** every phase 2 document is `approved`.

## WP1: Foundations

- **Models:**
  - `MoneySchema` (the `Money` type of the contract conventions).
  - `ModelCallRecordSchema` with the outcome enum, `ProcessingRunSchema`, and row schemas for the triage decision, extraction result, and candidate.
  - `CandidateId` in `QueueMessageIdsSchema`.
- **Migration 0009** and the expected-schema list. The phase 2 queue types join the enum with their consumers in WP4 to WP7.
- **Configuration loader** for the new keys, with `processing.enabled` off.
- **Tests:** schema unit tests (REQ-NFR-011 AC1, AC3), and a migration integration test that 0009 applies on top of 0008 and that the phase 1 Worker's queries still run (REQ-NFR-020).
- **Exit:** migration 0009 is applied in staging by the pipeline, and nothing reads it yet.

## WP2: Model-call helper

- **`callModel`** in `packages/models`: budget check at the first attempt, the Workers AI call with gateway options and metadata, repair, validation, quote check, retries with errors and backoff, and one `model_call` row per attempt.
- **Cost:** a price table with a version. Whether the binding returns the gateway cost is checked on the first `evals` call. If it does not, the record is marked estimated (ADR 0054).
- **A fake Workers AI binding** that returns recorded responses, rate-limit errors, and malformed output.
- **Tests:**
  - no direct provider URL in the code (REQ-NFR-003 AC1);
  - a record for each attempt and outcome, with no text in it (REQ-NFR-011);
  - a refusal once the budget is reached, while a started step finishes (REQ-NFR-005 AC2);
  - repair without an attempt, and retry with errors (REQ-TEST-002).
- **Exit:** the benchmark harness can run on `callModel` in the `evals` environment.

## WP3: Prompts

- **`packages/prompts`:** `triage@1` and `extraction@1`, built from the signal table and rules of the agent documents, with publication text inside delimiters, and the sampling settings.
- **Contract tests** for triage and extraction, using valid, invalid, and injection fixtures:
  - missing field, wrong type, out of range (REQ-TEST-002 AC1);
  - a quote that is not in the text, and a candidate with no customer (REQ-PROC-009 AC1, AC3);
  - `Signals` with an extra `TriageScore` (REQ-PROC-008 AC1).
- **Exit:** the benchmark (OQ-036) runs on these prompts. Its ADR records the chosen model and prompt version per step.

## WP4: Full text

- The text queue, the `document.extract_text` type, the producer in the document consumer, and the text consumer with unpdf.
- Measure peak memory and CPU on the four fixture PDFs of ADR 0009 (large, scanned, two-column with equations, corrupt), all openly licensed. Set `text.max_pdf_bytes` and `text.max_pages` from the measurement.
- **Tests:** text stored with the extractor name and version (REQ-DATA-006 AC1); byte cap, page cap, corrupt and empty text marked failed with the abstract kept (AC2); a repeated message changes nothing.
- **Exit:** staging extracts text from stored PDFs without a dead letter caused by memory.

## WP5: Embeddings and search

- **`packages/vector-store`:** a fake Vectorize with exact cosine ranking, and the registry seeded with the existing index.
- **Pipeline:** the embedding queue and consumer, and the producer in the page consumer.
- **Search and backfill:** `searchPublications`, and the backfill command and cut-over of ADR 0056.
- **Recall corpus:** the corpus and its labelled neighbours (ADR 0057).
- **Tests:**
  - one current embedding with model name and version per publication, through `callModel` (REQ-PROC-001 AC1, AC3);
  - search stays on the old index until the backfill is complete (REQ-PROC-001 AC2);
  - metadata and filters (REQ-PROC-002 AC1, REQ-PROC-003 AC2);
  - ranking with scores (REQ-PROC-003 AC1);
  - the recall evaluator on fake vectors with known neighbours (REQ-PROC-003 AC3).
- **Exit:** the recall report on the chosen embedding model is at or above the threshold stored with the corpus.

## WP6: Triage

- The triage consumer (rules, model, code), the producer in the page consumer, the admission cron, and `admission_day`.
- **Tests:**
  - each rule reason without a model call (REQ-PROC-006 AC1, REQ-PROC-005 AC1);
  - decision fields stored (REQ-PROC-006 AC2);
  - score and accept rule with stubbed signals (REQ-PROC-008 AC2, AC3);
  - ranking, tie-breaks, and the same order for the same input (REQ-PROC-008 AC4);
  - at most the daily limit admitted, the rest `daily-limit` and considered the next day (REQ-PROC-005 AC2);
  - a repeated admission trigger admits nothing twice;
  - rejected publications still embedded and searchable (REQ-PROC-005 AC3).
- **Exit:** the triage eval on the configured model and prompt meets its threshold (REQ-PROC-006 AC3, REQ-PROC-008 AC6).

## WP7: Extraction

- The extraction consumer, input-mode selection, the full-text cut, candidate IDs, and the `extraction_result` and `candidate` rows.
- **Tests:**
  - each candidate references its publication and has a finding and an evidence quote (REQ-PROC-004 AC1);
  - zero to the maximum number of candidates, and an empty list with notes (REQ-PROC-004 AC2, REQ-PROC-009 AC5);
  - quote rejection and the optional fields left empty when not quoted (REQ-PROC-009 AC2, AC3);
  - a generic party rejected as customer by the eval set (REQ-PROC-009 AC4);
  - no candidate for a burden of a population or sector with no customer that can act, as in `gs-extraction-015` and `gs-extraction-020` (REQ-PROC-009 AC6, ADR 0050);
  - `InputMode` recorded, and `Confidence` capped on abstract input (REQ-DATA-006 AC3).
- **Exit:** the extraction eval meets its threshold (REQ-PROC-004 AC3). The first run also reviews the rule of ADR 0050 (OQ-038) with real data.

## WP8: Retractions

- The weekly check against OpenAlex and arXiv, the daily sweep, vector deletion, and hidden candidates and opportunities.
- **Tests:** a retracted fixture record (`apps/pipeline/src/fixtures/openalex/work-retracted.json`) flagged on the next run (REQ-DATA-008 AC1); its candidates and opportunity hidden with the reason (AC2); its vector removed (AC3, REQ-PROC-002 AC2); a repeated sweep changes nothing.
- **Exit:** the integration test passes, and the first weekly check in staging reports its counts.

## WP9: Budget and cost reporting

- `budget_day` from configuration, the `budget-stop` alert, deferral and re-queueing of deferred messages, and the processing run report with cost per publication and per opportunity.
- **Tests:** budget from the formula per environment (REQ-NFR-005 AC1); stop behavior and one alert per day (AC2); cost figures in the report (AC3).
- **Exit:** the first staging day replaces the cost estimate in [ingestion scope](../data-sources/ingestion-scope.md) with a measured cost (ADR 0032).

## WP10: Thin slice

- Migration 0010, `CandidateWorkflow` with stub steps from the examples, the placeholder score model, the read route of ADR 0058, and the `slice` command and run report.
- Add `Customer` and `CustomerQuote` to the example candidate. Add a test that validates the examples against the `packages/models` schemas.
- **Tests:** the slice integration test with local bindings covers AC1 to AC3 (REQ-PROC-007). A test replaces one stub step with another implementation and the pipeline is unchanged (AC4).
- **Exit:** `pnpm --filter @roi/pipeline slice` runs locally and the read route returns the opportunity.

## WP11: Throughput and exit

- A load test on recorded fixtures with stubbed models at the largest measured day: ingestion and triage finish before the next run, and the daily limit completes extraction within 24 hours (REQ-NFR-010).
- Seven staging days with the switch on. Collect the exit evidence of [approach](approach.md#exit-evidence). Set every phase 2 requirement to `done` with its tests.
- **Exit:** the phase 2 exit criteria of the [roadmap](../roadmap.md#exit-criteria) are met, and phase 3 can start.
