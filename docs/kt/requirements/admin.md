---
title: Admin requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-API-005, REQ-NFR-012, REQ-ACC-009]
---

# Admin requirements

Admin operations let an administrator correct bad output and recover failed work without a database edit. They use the admin API (ADR 0018, REQ-API-005) and are recorded in the audit log (REQ-ACC-009).

### REQ-ADM-001: Hide and unhide an opportunity

An admin can hide an opportunity from ranking and show it again.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; runbook "Bad output reached the dashboard"
- Depends on: REQ-API-005, REQ-SCORE-005
- Acceptance criteria:
  1. An admin hides an opportunity with a required reason of 1 to 500 characters. A hidden opportunity is excluded from lists, Home, the priority matrix, and trends, and stays in the database and the audit log.
  2. A direct request for a hidden opportunity shows a hidden notice to an admin and the not-found page to other roles (REQ-DASH-014).
  3. An admin unhides it; the reason is optional.
  4. Both actions are recorded with the actor, time, and reason (REQ-ACC-009).
- Verification: integration test and end-to-end test

### REQ-ADM-002: Rerun a failed candidate

An admin can rerun a failed or incomplete candidate.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; runbook "A model provider is down"
- Depends on: REQ-API-005, REQ-AGENT-007
- Acceptance criteria:
  1. A rerun creates a new pipeline run for the candidate and starts at the first failed step, reusing the stored outputs of completed steps.
  2. A rerun of a candidate that is complete needs an explicit option to rerun from the first step.
  3. The previous run, outputs, and scores stay in the history (data model).
  4. A rerun respects the daily budget (REQ-NFR-005) and is refused with a clear message when the budget is reached.
  5. The action is recorded in the audit log.
- Verification: integration test with stubbed model responses

### REQ-ADM-003: Rescore under a new score model version

An admin can rescore stored opportunities after the score model changes.

- Phase: 4
- Priority: should
- Status: planned
- Source: Readiness assessment; [scoring](../scoring.md) versioning
- Depends on: REQ-SCORE-003, REQ-API-005
- Acceptance criteria:
  1. A rescore reads stored agent outputs only. It makes no model call and costs nothing.
  2. It creates a new score per opportunity with the new score model version; old scores stay (REQ-SCORE-007 criterion 4).
  3. Rankings and lists use the active score model version, set by an admin. Scores of other versions are never mixed in one ranking.
  4. A rescore job reports counts and failures in a run report (REQ-NFR-008).
- Verification: integration test over seeded agent outputs

### REQ-ADM-004: Role matrix for auth and admin routes

Every auth and admin route is covered by a role test.

- Phase: 4
- Priority: must
- Status: planned
- Source: ADR 0018
- Depends on: REQ-API-005, REQ-NFR-012
- Acceptance criteria:
  1. A fixture lists every route with its allowed roles, and a test fails when a route exists that the fixture does not list.
  2. For each route, the test sends a request as each role and as an unauthenticated caller, and asserts the allowed or refused result.
- Verification: integration test
