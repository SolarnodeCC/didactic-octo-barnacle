---
title: "0042: arXiv 90-day limit on the date of the first version"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-05
related: [REQ-DATA-002, REQ-DATA-009]
---

# 0042: arXiv 90-day limit on the date of the first version

- Decision status: Accepted
- Date: 2026-11-05
- Changes: the arXiv part of [0035](0035-ninety-day-window-and-resumable-runs.md) and [0041](0041-short-backfill-and-primary-topic-scope.md), which measured the 90-day limit on the date of the last update

## Context

`Staging measure` of 5 November 2026 showed arXiv records spread over 688 publication days. The arXiv feed is sorted by the last update, and the limit of `ingestion.max_age_days` was checked against that date, so an old preprint with a new version was stored. That contradicts "never older than 90 days before the day of the run" (REQ-DATA-009 AC3).

## Options considered

1. **Keep the last-update date.** Follows the feed order and keeps every update, but stores old preprints.
2. **Sort by first submission date.** Strict, but a new version of a preprint that we stored earlier is not found any more, which breaks REQ-DATA-002 AC3.
3. **Limit the query to first submissions in the window and keep the sort by last update.** arXiv accepts a `submittedDate` range together with `sortBy=lastUpdatedDate` (checked with a live request on 2026-11-05: a version 3 of a preprint submitted on 13 October came back with its update of 4 November).

## Decision

- Option 3. The query adds `AND submittedDate:[<limit> TO <day of the run>]`, and the collector skips an entry whose `published` date is before the limit when it stores. The limit is the day `ingestion.max_age_days` before the day of the run.
- The window of a run keeps following the date of the last update, so new versions of recent preprints are picked up.
- Records that are already stored stay. They are not deleted and get no new versions.

## Consequences

- New arXiv records are at most 90 days old by publication date, like OpenAlex (REQ-DATA-009 AC6).
- The result set shrinks, because updates of old preprints no longer count, and so do the runs that stopped at the page cap.
- The lower bound moves one day per day. A saved page offset of a continued run can shift slightly; a duplicate is harmless (upsert) and a missed entry is covered by the overlap of the next window.
