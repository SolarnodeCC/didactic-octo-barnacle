---
title: "0052: Daily admission to extraction and the budget stop"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-PROC-005, REQ-PROC-008, REQ-NFR-005, REQ-NFR-010, REQ-NFR-019]
---

# 0052: Daily admission to extraction and the budget stop

- Decision status: Proposed
- Date: 2026-11-06

## Context

REQ-PROC-008 AC4 ranks the publications that pass triage across a day and admits at most the daily limit, with fixed tie-breaks. Publications above the limit are considered again the next day ([triage](../agents/triage.md)). A queue consumer sees one publication at a time, so it cannot rank a day.

REQ-NFR-005 AC2 says that when the daily budget is reached, no new pipeline runs start that day and running steps finish. Nothing says where the day's spending is kept, or what "a new run" means before candidate Workflows exist.

## Options considered

1. **Rank inside the triage consumer** against the decisions stored so far. The order would depend on arrival time, so the same input could give a different order.
2. **A daily admission cron** that ranks every passing decision waiting in a pool.
3. **Budget in a Durable Object** (ADR 0017). It is exact under concurrency, but it adds a Durable Object in phase 2 for one counter.
4. **Budget in a D1 row per day**, checked before each step and added to after each call.

## Decision

Options 2 and 4.

**Admission:**

- The triage consumer stores a publication that passes the signal rule as `awaiting-admission`.
- The admission cron runs at `0 11 * * *` UTC, after both ingestion crons:
  - It takes the `awaiting-admission` decisions of the last `triage.admission_pool_days` (7).
  - It admits the daily limit, minus those already admitted that UTC day, with `admitWithinDailyLimit`, and queues `publication.extract` for them.
  - It marks the rest `daily-limit`. They stay in the pool and are considered again the next day.
- `admission_day` keys the run by its day, so a second trigger admits nothing twice.
- The cron also queues triage again for publications deferred by the budget, and sweeps retracted publications ([design](../phase-2/design.md#retractions)).

**Budget:**

- `budget_day` holds the limit, the amount spent, and when it stopped.
- `callModel` checks it at the first attempt of a step and adds each call's cost in the batch that writes the `model_call` row.
- When the spending reaches the limit:
  - Steps that have not started are refused. Triage and embedding messages complete as `budget-deferred`.
  - Admission admits nothing.
  - One `budget-stop` alert is sent that day (REQ-NFR-019).
- Retries of a started step are not checked, so running steps finish.

## Consequences

- The same input gives the same admission order (REQ-PROC-008 AC4).
- Under concurrency the budget can be overshot by the steps already started: at most the model-queue concurrency × `model.max_attempts` × the dearest call. At phase 2 prices this is a few cents. A Durable Object counter can replace the row if that changes.
- Extraction of a day's admitted publications starts at 11:00 UTC. A publication triaged after that waits until the next day.
- [Orchestration](../architecture/orchestration.md) and [defaults](../architecture/defaults.md) gain the admission cron and its keys when this is accepted.
