---
title: "0041: 14-day backfill, 90-day storage limit, and primary-topic scope"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-05
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009]
---

# 0041: 14-day backfill, 90-day storage limit, and primary-topic scope

- Decision status: Accepted
- Date: 2026-11-05
- Changes: `ingestion.backfill_days` of [0035](0035-ninety-day-window-and-resumable-runs.md), which now has two keys, and the OpenAlex topic filter of [ingestion scope](../data-sources/ingestion-scope.md)

## Context

The `Staging measure` report of 2026-11-05 showed 20 runs and none `succeeded`: 15 `partial` at the page cap and 4 `failed` on a dead-lettered arXiv page. Because no run ever succeeded, every run started from the full 90-day window.

- With the request filter `topics.subfield.id` (any of a work's up to three topics), the 90-day OpenAlex window held about 4.2 million works on 2026-11-05. A run fetches at most 5,000 (`ingestion.max_pages_per_run` 50 pages of 100). Filtering on the primary topic gives about 0.7 million in 90 days.
- The OpenAlex request had no `sort`. The cursor followed an internal ranking that moved between runs, so a continued run mostly re-read works it had already stored (about 92% `unchanged` per run).
- On arXiv the long window pushed continued runs to offsets of 6,600 to 10,000, where pages failed and were dead-lettered. A run with a dead-lettered page is not continued, so the next run started at offset 0 again.

## Options considered

1. **Raise the page cap.** Longer runs and more API traffic; OpenAlex would still not fit.
2. **Shorten the whole window to 14 days.** Fits sooner, but OpenAlex adds works weeks after their publication date, so a 14-day storage limit would drop those for good.
3. **Shorter first window, same storage limit, narrower scope, stable sort.** Chosen.

## Decision

- `ingestion.backfill_days` is 14: the window of a first run, when a source has no succeeded run.
- `ingestion.max_age_days` is 90: the longest a window may reach back and the limit of what a run stores, as `backfill_days` was in 0035. REQ-DATA-009 AC3 and AC6 keep their 90-day limit under this key.
- A partial run whose window begins before today minus `ingestion.max_age_days` is not continued; a fresh window replaces it. Its oldest days can no longer be stored, and its cursor may come from an older request format. This also retires the 90-day chains on staging.
- The OpenAlex request filters on `primary_topic.subfield.id`, and the collector's name check uses the primary topic (or the first topic when `primary_topic` is absent). All topics of a stored work are still stored.
- The OpenAlex request sorts by `publication_date:desc`, so a saved cursor keeps its place between runs.

## Consequences

- A first run covers 14 days. Days beyond that, up to 90, are reached only by later windows that start further back after a gap, or by a separate, deliberate backfill.
- Works whose primary topic is outside the topic map are no longer stored, even when a secondary topic is in it. Existing rows stay.
- OpenAlex in-scope volume is still about 11,000 works per publication day (22 to 30 October 2026), more than one run of 5,000 can fetch. The page cap or the scope needs a further decision once `Staging measure` shows runs on this configuration; the run stays `partial` until then.
- The `OpenAlex scope lookup` workflow still counts by `topics.subfield.id`; its counts are an upper bound until it is aligned.
