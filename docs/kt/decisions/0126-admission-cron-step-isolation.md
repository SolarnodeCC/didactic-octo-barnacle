---
title: "0126: Admission cron step isolation and the retraction sweep index"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-28
related: [REQ-DATA-008, REQ-PROC-005, REQ-PROC-010, REQ-NFR-019, REQ-NFR-020]
---

# 0126: Admission cron step isolation and the retraction sweep index

- Decision status: Accepted
- Date: 2026-11-28
- Builds on: [ADR 0055](0055-daily-admission-and-budget-stop.md), [ADR 0063](0063-automatic-recovery-without-an-admin.md)

## Context

The 11:00 UTC cron runs, in order, the report of yesterday's run, the retraction sweep, the re-drives, the admission, the queueing of admitted extractions, and the embedding backfill. On the first processing day in staging (2026-11-28) the retraction sweep looked for retracted publications not yet handled with a query that had no index. It read all 114,572 publication rows in 10.8 s with a cold cache, D1 refused the next query ("D1 DB is overloaded. Too many resources consumed within a 10 second window"), and the exception ended the cron. Nobody was admitted, no extraction was queued, and no alert was raised, because only a failed ingestion start sends one.

## Options considered

1. **Add an index only.** It removes this cause, but any later failure in an early step would again stop the admission without an alert.
2. **Add an index and run each step on its own,** with an alert for a failed step.
3. **Move the sweep to its own cron.** It separates the sweep from the admission but not the re-drives, and adds a schedule to keep in order.

## Decision

Option 2.

- Migration 0017 adds the partial index `publication_retraction_pending_idx` on `publication (id)` where `retracted = 1 AND retraction_handled_at IS NULL`. The sweep reads only the pending rows, already in ID order.
- `runAdmissionCron` runs every step in its own try/catch. A failed step is logged as `cron.step_failed` and raises a `failed-run` alert with the source `admission:<step>`; the later steps still run. Queueing the admitted extractions is skipped only when the admission itself failed. After the last step the first error is thrown again, so the cron invocation still shows as failed.

## Consequences

- One failing step no longer holds back the day's admission (REQ-PROC-005), and the owner learns of the failure the same day (REQ-NFR-019).
- A failed sweep leaves its publications unstamped, so the next day's sweep handles them (REQ-DATA-008). Until then, a retracted publication awaiting admission can be admitted for one day; the sweep hides its output on the next run.
- The index is additive, so the previous Worker keeps working (REQ-NFR-020).
