---
title: "0114: Cost per publication and per opportunity in the processing run report"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-NFR-005, REQ-NFR-008]
---

# 0114: Cost per publication and per opportunity in the processing run report

- Decision status: Accepted
- Date: 2026-11-23
- Changes: how the processing run report of [ADR 0054](0054-processing-runs-and-model-call-records.md) computes its cost figures, and when a run is closed and reported ([phase 2 design](../phase-2/design.md#budget))

## Context

REQ-NFR-005 AC3 asks for the cost per publication and per opportunity of each run, and ADR 0054 says the `model_call` rows make this possible, but no document says which calls and which items count. Phase 1's estimate (ADR 0032) took one triage call plus one extraction call per publication. In phase 2 a publication is triaged and embedded, only some are extracted, a call can be retried, and one embedding call serves a batch of up to 50 publications with no `publication_id`. Nothing closed a `daily` processing run either, so it had no end and no report.

## Options considered

1. **Cost of extracted publications only.** This hides the triage and embedding cost that every publication carries.
2. **Split each embedding call over its batch.** The call row does not name its publications, so the split would need a new column for a few cents a day.
3. **Every call of the run over the publications it served.** Chosen.

## Decision

- **Total.** The cost of every `model_call` of the run (`run_kind = 'processing'`, `run_id`), with retries and embedding calls included.
- **Cost per publication.** The total divided by the distinct publications with at least one call in the run. Embedding calls add their cost but no publications.
- **Cost per opportunity.** The total divided by the candidates written by the run's extractions. In phase 2 an opportunity is a candidate (ADR 0015). It is null when the run wrote none.
- **By step.** Calls, distinct publications (null for embedding), and cost per `step_name`, plus the share of the total estimated from the price table rather than reported by the gateway.
- **Budget.** The report also holds the day's limit, the amount spent, and `stopped_at` from `budget_day`.
- **Closing.** The admission cron first closes every `daily` run of an earlier day that is still `running`: `partial` when it lists `failed-final` items, otherwise `succeeded`. It then writes the report of every finished run without one, at most 20 a run, into `processing_run.report_json` (migration 0012), and logs it as `processing.report`. A late message of a closed run still writes its rows, but the stored report does not change.
- **Content.** The report holds IDs, counts, and amounts. Failure reasons are shortened as in the ingestion report (REQ-NFR-019 AC4).

## Consequences

- A day's figures are available at 11:00 UTC the next day. The first staging report gives the measured cost that replaces the estimate in [ingestion scope](../data-sources/ingestion-scope.md) (ADR 0032, the exit of WP9).
- Backfill and retraction-check runs get a report too once they finish. A backfill's embeddings are recorded under the daily run of the day they ran, so its own report shows counts and no cost.
- The cost per publication counts each publication once per run, whatever steps it reached. It is therefore comparable from day to day, but it is not the phase 1 estimate of one triage plus one extraction call.
