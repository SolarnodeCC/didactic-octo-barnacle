---
title: Operations requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Operations requirements

Observability, throughput, service levels, alert routing, and database migrations with environment bootstrap. Operating procedures are in [operations](../../operations.md).

### REQ-NFR-008: Observability

Every run can be followed and every failure can be found.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: KT review of operations
- Acceptance criteria:
  1. Logs are structured and carry a run ID and, where relevant, a publication ID and opportunity ID.
  2. Each ingestion and pipeline run produces a run report with counts and failed items.
  3. A failed scheduled run raises an alert (REQ-NFR-019).
- Verification: integration test and code review

### REQ-NFR-010: Throughput

The platform keeps up with the configured ingestion scope.

- Phase: 2
- Priority: should
- Status: planned
- Source: overview (thousands of papers each day)
- Acceptance criteria:
  1. A daily ingestion and triage run for the configured scope finishes before the next scheduled run.
  2. The configured daily number of triaged publications completes triage and opportunity extraction within 24 hours. From phase 3, that same daily number also completes the agent pipeline within 24 hours.
- Verification: load test on recorded fixtures with stubbed models

### REQ-NFR-017: Service levels

The dashboard and the API meet stated availability and latency targets.

- Phase: 4
- Priority: should
- Status: planned
- Source: Readiness assessment
- Depends on: REQ-API-001, REQ-DASH-002
- Acceptance criteria:
  1. The list endpoint (REQ-API-001) answers within 500 ms at the 95th percentile on a seeded database of 10,000 opportunities, and the detail endpoint within 800 ms.
  2. The supported browsers are the current and previous major versions of Chrome, Edge, Firefox, and Safari.
  3. The availability target of the dashboard and the API is 99.5 % per month, and a breach raises an alert (REQ-NFR-008).
  4. The recovery point objective is 24 hours and the recovery time objective is 4 hours, tested once with a D1 restore before launch (see [operations](../../operations.md)).
  5. These targets are accepted for the pilot launch and are reviewed before general availability.
- Verification: load test on seeded data and a restore drill

### REQ-NFR-019: Alert routing

Alerts reach people by email and open a GitHub issue.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: Readiness assessment; operations monitoring
- Depends on: REQ-NFR-008
- Acceptance criteria:
  1. An alert is raised for a failed scheduled run, a run past its time window, a budget stop, a dead-lettered message (REQ-DATA-011), and a breach of the availability target (REQ-NFR-017).
  2. Each alert sends an email to the configured ops address and opens a GitHub issue in this repository with the label `alert`, the alert type, the environment, the run ID, the summary of the run report, and the path of the full report (served by the admin API from phase 4, REQ-ADM-004).
  3. A repeated alert with the same key (type, environment, source) within 24 hours adds a comment to the open issue instead of opening another issue or email.
  4. An alert never contains publication text, prompts, user data, or secrets.
  5. The alert credentials are secrets listed in [operations](../../operations.md); the GitHub token can only create and comment on issues.
- Verification: integration test with stubbed email and GitHub clients

### REQ-NFR-020: Migrations and environment bootstrap

Database changes and environment resources are created by versioned, repeatable steps.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: Readiness assessment; ADR 0020
- Depends on: REQ-NFR-002
- Acceptance criteria:
  1. The bootstrap script creates every missing resource of an environment, and a second run changes nothing and reports no drift.
  2. Migrations are numbered SQL files, applied in order before the Worker that needs them, and are never edited after they have been applied in production.
  3. A migration keeps the previous Worker version working (add first, remove in a later migration after the old version is gone).
  4. A test applies all migrations to an empty local database and checks that the tables and columns the contracts in `packages/models` need exist.
  5. Each environment's token and account ID are secrets listed in [operations](../../operations.md), with the least permissions the environment needs.
- Verification: integration test of the migrations and the bootstrap against local bindings
