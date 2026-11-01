---
title: "0035: 90-day window and resumable runs"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-01
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009]
---

# 0035: 90-day window and resumable runs

- Decision status: Accepted
- Date: 2026-11-01
- Changes: the 30-day OpenAlex window of [ingestion scope](../data-sources/ingestion-scope.md) and `ingestion.backfill_days`

## Context

The pilot window was the last 30 days. We want 90 days, and we want a guarantee that a run only looks at new data and never at data older than 90 days before the day of the run. A first run of 90 days is more than one run can fetch (`ingestion.max_pages_per_run` is 50 pages of 100). A run that hit the cap was `partial`, stored no window end, and the next run began again at the first page, so the pages after the cap were never reached.

Duplicates are not the issue: unique indexes on DOI, arXiv ID, and `(source, source_work_id)` and the upsert make a repeated fetch harmless (REQ-DATA-001, REQ-DATA-002, REQ-DATA-007).

## Options considered

1. **Raise the page cap.** Simple, but the volume is not measured and the OpenAlex daily budget is a risk.
2. **Only change `ingestion.backfill_days`.** Does not fix the cap; an existing database with a succeeded run does not backfill anyway.
3. **Resumable runs.** A run that stops at the cap keeps the cursor of the next page, and the next run continues there.

## Decision

- `ingestion.backfill_days` is 90. It is the longest a window can reach back, and also the limit of what a run stores: a publication dated more than 90 days before the day of the run is skipped, also by a run that continues an earlier one.
- A run that ends `partial` only because it hit the page cap (no failed item, nothing dead-lettered) keeps its cursor and window. The next run of that source continues there. A run with failed items is not continued: the fresh window covers them again.
- The run that finishes a continued window is `succeeded` and stores the window end of the first run of the chain (`ingestion_run.window_end`, migration 0007), so the next window overlaps everything published since the chain began.
- An existing database is not backfilled automatically; days beyond its last window need a separate, deliberate action.

## Consequences

- A 90-day first run can take several days (one capped run per day) and shows as `partial` until the window is done.
- arXiv continues by offset on a feed sorted by last update. Entries can move between runs: a duplicate is harmless, and a missed one is covered by the overlap of the next window.
- OpenAlex still downloads works outside the topic map until the subfield IDs are configured (see the ingestion scope); a continued run keeps its original `from_publication_date` so its saved cursor stays valid, and drops older works while storing.
