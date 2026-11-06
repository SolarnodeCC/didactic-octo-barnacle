---
title: "0051: Phase 1 exits on sufficient data, not on a succeeded run"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009, REQ-NFR-005]
---

# 0051: Phase 1 exits on sufficient data, not on a succeeded run

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the phase 1 exit criterion of the [roadmap](../roadmap.md)

## Context

The phase 1 exit criterion asked for a scheduled run that ingests the pilot scope. The `Staging scheduled checks` report of 6 November 2026 showed 22 runs: 0 `succeeded`, 18 `partial` at the page cap, and 4 `failed`. A run is `succeeded` only when it finishes its whole window (REQ-DATA-009 AC4). With 50 pages a run against about 3,400 new OpenAlex works a day, ADR 0048 expects the first `succeeded` OpenAlex run in two to three weeks.

The goal of phase 1 for phase 2 is data to analyse: publications to draw benchmark and golden-set items from, the mean abstract length, and the daily volume for the cost estimate (ADR 0032). The same report already holds 13,372 arXiv and 14,028 OpenAlex publications.

## Options considered

1. **Keep the criterion and wait** for a `succeeded` run on both sources.
2. **Raise `ingestion.max_pages_per_run`** to finish the OpenAlex window sooner. Changes steady-state cost and limits before they are measured.
3. **Exit on a minimum of stored data**, with `partial` runs counting. Chosen by the owner.

## Decision

Phase 1 is done when scheduled runs have stored enough data to analyse, without a `succeeded` run being needed:

- For each of OpenAlex and arXiv, at least 1,000 publications in the pilot scope with a title and an abstract, over at least 7 distinct publication days, in the deployed staging pipeline. Runs that stop at the page cap count.
- No duplicates by source ID, delivering every queue message twice changes nothing, and the run report shows counts and failures, as before.
- The daily volume is recorded in [ingestion scope](../data-sources/ingestion-scope.md): from the deployed pipeline, a lower bound while runs stop at the page cap, together with the count on the source API (ADR 0048). The cost per publication is estimated from it (ADR 0032).

1,000 publications per source leaves a margin of about twenty times over the shared benchmark set of about 50 items (stratified by source, field, and abstract length) and over the minimum of 20 entries per golden set (REQ-TEST-005).

## Consequences

- REQ-DATA-009 and the page cap are unchanged. Runs keep continuing their window, and the first `succeeded` run moves the cursor as before.
- By the report of 6 November 2026, the data part of the criterion is met: arXiv 13,372 stored, 100.0 % with abstract, over 744 publication days; OpenAlex 14,028 stored, 79.4 % with abstract (about 11,100), over 242 publication days.
- Failed runs and dead-lettered messages stay visible in the run report and alerts (REQ-NFR-019). They do not block the exit, but each is still handled under [operations](../operations.md).
- Phase 2 still needs its own Definition of Ready: approved requirement files and the answered phase 2 questions, OQ-036 for triage and extraction among them.
