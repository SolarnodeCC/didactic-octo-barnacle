---
title: Phase 2 exit evidence
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-010, REQ-NFR-005, REQ-PROC-003, REQ-PROC-007]
---

# Phase 2 exit evidence

Where the evidence of the phase 2 exit is collected (WP11 of the [build plan](build-plan.md)). The exit criteria are those of the [roadmap](../roadmap.md#exit-criteria) and the [approach](approach.md#exit-evidence); the build is complete in code, so what remains needs the staging days, the `evals` environment, or a run by the owner. Each row is filled in by the pull request that adds its evidence.

## Exit criteria and work package exits

| Item | Evidence | Where it runs | Status |
|---|---|---|---|
| Recall at 10 of at least 0.8 (WP5) | The recall report on the configured embedding model (ADR 0057), `pnpm --filter @roi/agent-extraction run recall` | `evals`, needs a valid Workers AI token | open: the token in the session environment was invalid |
| Triage meets its golden-set threshold (WP6) | Eval rerun on `model.triage` and `triage@2` | `evals` | open |
| Extraction meets its golden-set threshold (WP7) | Eval rerun on `model.extraction` and `extraction@4` | `evals` | open |
| Candidates within the daily budget (WP9) | Seven staging days with no budget stop, or a stop that worked as REQ-NFR-005 AC2 says; cost per publication and per opportunity in each daily report | staging | open: processing turned on by WP11 |
| Measured cost replaces the estimate (WP9) | The first staging day's report, copied into [ingestion scope](../data-sources/ingestion-scope.md) | staging | open |
| Throughput (WP11) | The load test of ADR 0118 passes at 4,634 publications in CI; the staging days confirm the times | CI, staging | load test passing; staging open |
| Text extraction without memory dead letters (WP4) | Staging days with no text dead letter for memory | staging | open |
| First weekly retraction check (WP8) | The `rc_<day>` run report of the first Monday at 08:00 UTC | staging | open |
| Thin slice end to end (WP10) | The slice test in CI, and one run of `pnpm --filter @roi/pipeline slice` in the development environment with its report | CI, development | CI passing; development run open |
| Seven staging days (WP11) | One row per day below | staging | open |

## Staging days

| Day | Ingested | Triaged | Extracted | Candidates | Cost (EUR) | Cost per opportunity | Budget stop | Alerts |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |

## Phase 2 requirements

Every phase 2 requirement is `in-progress` until the evidence above closes its last acceptance criterion; it is then set to `done` in the pull request that adds that evidence (approach, `check:traceability`).

| Requirement | Closed by |
|---|---|
| REQ-DATA-006, REQ-PROC-011 | Staging days: text extraction and the full-text wait |
| REQ-DATA-008 | The first weekly retraction check |
| REQ-DATA-012, REQ-PROC-010 | Staging days: dead-letter replay and re-drives |
| REQ-PROC-001, REQ-PROC-002, REQ-PROC-003 | The recall report |
| REQ-PROC-004, REQ-PROC-005, REQ-PROC-006, REQ-PROC-008, REQ-PROC-009, REQ-TEST-006, REQ-TEST-007 | The eval reruns and the owner's label review |
| REQ-PROC-007 | The development run of the slice |
| REQ-NFR-003, REQ-NFR-011 | Staging days: AI Gateway logs agree with the usage records |
| REQ-NFR-005 | The staging days and the measured cost |
| REQ-NFR-010 | The staging days confirm the load test |
| REQ-NFR-023 | The quality section on the staging days; alerts start after 14 days |
| REQ-REV-001 to REQ-REV-005 | The review tool deployed to staging behind Access and used on staging output |
| REQ-TEST-002 | Contract tests in CI; closed with the eval reruns |
