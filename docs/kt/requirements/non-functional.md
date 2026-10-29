---
title: Non-functional requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Non-functional requirements

Security measures are described in [security](../architecture/security.md).

## Platform

### REQ-NFR-002: Cloudflare platform

The platform runs on the Cloudflare services listed in the [technology stack](../architecture/technology-stack.md).

- Phase: 1
- Priority: must
- Status: planned
- Source: README Technology Stack
- Acceptance criteria:
  1. Every runtime component is deployed as a Cloudflare Worker, Workflow, or Durable Object. The dashboard runs on Workers through the OpenNext adapter (ADR 0012).
  2. A service outside the listed stack is only added with an ADR.
- Verification: code review

### REQ-NFR-003: Model calls through AI Gateway

All calls to model providers, including embedding calls, go through Cloudflare AI Gateway.

- Phase: 2
- Priority: must
- Status: planned
- Source: README Technology Stack
- Acceptance criteria:
  1. No component calls OpenAI, Anthropic, or another model provider directly.
  2. Tokens, cost, and latency per agent and per pipeline run can be read from the gateway.
- Verification: code review and integration test

### REQ-NFR-011: Usage recorded per model call

Every model call is recorded in the platform's own database with its usage and cost.

- Phase: 2
- Priority: must
- Status: planned
- Source: KT review of a comparable internal governance platform (token use and cost transparency) and REQ-NFR-005
- Depends on: REQ-NFR-003
- Acceptance criteria:
  1. Every model call, including embedding calls and retries, creates a model call record with the run ID, pipeline step, agent (when one applies), model, prompt version (when one applies), attempt number, input and output tokens, latency, cost as `Money`, and outcome (`ok`, `invalid-output`, or `provider-error`).
  2. The cost comes from AI Gateway. When the gateway returns none, the cost is computed from a configured price table, the table version is stored, and the record is marked as estimated.
  3. A record holds no publication text and no prompt text.
  4. Totals per agent, per step, and per day can be computed from the records alone, and agree with the AI Gateway totals within the tolerance stated in the test.
- Verification: integration test with a stubbed gateway

### REQ-NFR-005: Cost budget

Model spending stays within a configured budget.

- Phase: 2
- Priority: must
- Status: planned
- Source: KT review of cost and volume
- Depends on: REQ-NFR-003
- Acceptance criteria:
  1. A daily budget for model calls is configured per environment. Before calibration it is the daily limit times the measured cost per publication times 1.5, and phase 2 does not start without that measurement.
  2. When the budget is reached, no new pipeline runs start that day; running steps finish.
  3. Cost per publication and per opportunity is reported for each run.
- Verification: integration test with a stubbed gateway and a low budget

### REQ-NFR-008: Observability

Every run can be followed and every failure can be found.

- Phase: 1
- Priority: must
- Status: planned
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

## Security and data protection

### REQ-NFR-001: No secrets in the repository

Credentials are never committed.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: AGENTS.md repository conventions
- Acceptance criteria:
  1. API keys and Cloudflare tokens are stored in Cursor environment secrets or GitHub Actions secrets.
  2. Configuration names the secret instead of containing its value.
  3. GitHub secret scanning with push protection is enabled for the repository.
- Verification: code review, Bugbot, and GitHub secret scanning

### REQ-NFR-006: Untrusted content in model input

Publication text is treated as untrusted input to models.

- Phase: 3
- Priority: must
- Status: planned
- Source: KT review of security
- Acceptance criteria:
  1. Publication text is passed to models as delimited data, never as instructions.
  2. Agents have no tools that write data or send messages outside the pipeline. The only read tool is the bounded search tool (REQ-AGENT-013), and its results are treated as untrusted too.
  3. Fixtures with injected instructions in the abstract or full text do not change agent behavior beyond the contract.
- Verification: contract tests with injection fixtures and code review

### REQ-NFR-007: Authenticated access

Only authenticated users can use the dashboard and the API.

- Phase: 4
- Priority: must
- Status: planned
- Source: KT review of security
- Acceptance criteria:
  1. An unauthenticated request to the dashboard or the API is refused.
  2. Access is granted only to users created from an invitation (REQ-ACC-001) and can be revoked without a deployment (REQ-ACC-006).
  3. The dashboard and the API accept the same session (REQ-ACC-004).
- Verification: end-to-end test

### REQ-NFR-009: Personal data

The platform processes as little personal data as possible.

- Phase: 1
- Priority: must
- Status: planned
- Source: KT review of data protection
- Acceptance criteria:
  1. Only public author metadata from the sources is stored: name, source identifiers such as ORCID, and affiliation.
  2. User data is limited to the name and email address that accounts need (REQ-ACC-003), sign-in records, roles (REQ-NFR-012), score reviews (REQ-SCORE-007), and REQ-DASH-004.
  3. The processing of personal data is described in the security document.
- Verification: code review

### REQ-NFR-012: Roles

Every authenticated user has exactly one role: viewer, analyst, or admin.

- Phase: 4
- Priority: should
- Status: planned
- Source: REQ-SCORE-007 and REQ-DASH-008. Roles are chosen on the invitation and changed by an admin (REQ-ACC-002, REQ-ACC-006)
- Depends on: REQ-NFR-007
- Acceptance criteria:
  1. A viewer can read opportunities, scores, and explanations, and export a brief.
  2. An analyst can do everything a viewer can and also review scores (REQ-SCORE-007).
  3. An admin can do everything an analyst can and also open the usage and cost view (REQ-DASH-008).
  4. The API enforces the role. A request outside the role gets a forbidden error, whatever the dashboard shows.
  5. A user's role can change without a deployment.
- Verification: integration test and end-to-end test

## Documentation

### REQ-NFR-004: KT documents are checked in CI

The KT documents stay small, linked, and consistent.

- Phase: 1
- Priority: must
- Status: done
- Source: ADR 0002
- Acceptance criteria:
  1. CI fails when a KT file exceeds 400 lines or 25 KiB, or a requirement file holds more than 40 requirements.
  2. CI fails on missing frontmatter, broken relative links, a directory without an index, or an undefined or duplicate REQ-ID.
- Verification: `scripts/check-kt.py` in `.github/workflows/config.yml`

## Web security, privacy, and service levels

### REQ-NFR-013: Safe rendering of model and source content

Text and URLs written by models or taken from sources are rendered as plain text.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; ADR 0016
- Depends on: REQ-DASH-001
- Acceptance criteria:
  1. Model-generated and source-derived text is rendered as plain text. No such content is inserted as HTML.
  2. A URL becomes a link only when it uses `https`; links carry `rel="noopener noreferrer nofollow"`.
  3. The dashboard sends a Content Security Policy without inline scripts, `X-Content-Type-Options: nosniff`, a `Referrer-Policy`, and `frame-ancestors 'none'`.
  4. Tests render fixtures with script tags, `javascript:` URLs, and very long strings in every field a model writes, and assert that nothing executes or breaks the layout.
- Verification: unit tests of the link rule and end-to-end test with hostile fixtures

### REQ-NFR-014: Request integrity

State-changing requests are protected against cross-site request forgery, and the API accepts no other origins.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; ADR 0016
- Depends on: REQ-ACC-004
- Acceptance criteria:
  1. Every request that changes state needs a valid CSRF token and an `Origin` header that matches the site.
  2. The API sends no CORS headers that allow another origin.
  3. The dashboard and the API are served from one site, so the session cookie is never sent cross-site.
  4. A request with a missing or wrong token or origin gets a forbidden error and changes nothing.
- Verification: integration test and end-to-end test

### REQ-NFR-015: Data retention

Every class of stored data has a retention period, and deletion covers backups.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; OQ-030; [privacy](../architecture/privacy.md)
- Depends on: REQ-NFR-009
- Acceptance criteria:
  1. The [privacy](../architecture/privacy.md) document lists a retention period for model call records, run reports, raw source records, stored PDFs and text, sign-in records, audit events, and backups.
  2. A scheduled job deletes records that are past their period, and the job reports counts in a run report (REQ-NFR-008).
  3. A deletion or erasure request is also applied to restored backups before they serve traffic, and the privacy policy states the longest time a deleted record can remain in a backup.
- Verification: integration test of the retention job and review of the privacy document

### REQ-NFR-016: Author personal data

The platform has a documented lawful basis and an erasure process for the author data it stores.

- Phase: 1
- Priority: must
- Status: planned
- Source: Readiness assessment (GDPR); REQ-NFR-009
- Acceptance criteria:
  1. The [privacy](../architecture/privacy.md) document states the lawful basis for storing author names, ORCIDs, and affiliations, and how the notice to authors is given.
  2. A request from an author to erase their data removes the author record and their affiliations from the platform, keeps the publications, and is recorded in the audit log without the personal data.
  3. Author data is never shown outside provenance and is never used to profile people.
- Verification: integration test of author erasure and review of the privacy document

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
  4. The recovery point objective is 24 hours and the recovery time objective is 4 hours, tested once with a D1 restore before launch (see [operations](../operations.md)).
  5. These targets are accepted for the pilot launch and are reviewed before general availability.
- Verification: load test on seeded data and a restore drill

### REQ-NFR-018: Organization key on user-owned records

Records that users own carry an organization ID, so several organizations can be supported later without a migration.

- Phase: 4
- Priority: must
- Status: planned
- Source: OQ-010; ADR 0019
- Depends on: REQ-NFR-007, REQ-NFR-012
- Acceptance criteria:
  1. Users, invitations, sessions, audit events, score reviews, and opportunity status entries (REQ-DASH-004) carry an organization ID. The MVP has one organization, created at deployment.
  2. Every query on these records filters by the organization of the signed-in user through one shared data-access helper; no route builds its own filter.
  3. Publications, candidates, agent outputs, opportunities, and scores are shared by all organizations and carry no organization ID.
  4. An integration test with two organizations asserts that a user of one never reads, changes, or invites into the other, on every route that touches these records.
- Verification: integration test with two seeded organizations

### REQ-NFR-019: Alert routing

Alerts reach people by email and open a GitHub issue.

- Phase: 1
- Priority: must
- Status: planned
- Source: Readiness assessment; operations monitoring
- Depends on: REQ-NFR-008
- Acceptance criteria:
  1. An alert is raised for a failed scheduled run, a run past its time window, a budget stop, a dead-lettered message (REQ-DATA-011), and a breach of the availability target (REQ-NFR-017).
  2. Each alert sends an email to the configured ops address and opens a GitHub issue in this repository with the label `alert`, the alert type, the environment, the run ID, and a link to the run report.
  3. A repeated alert with the same key (type, environment, source) within 24 hours adds a comment to the open issue instead of opening another issue or email.
  4. An alert never contains publication text, prompts, user data, or secrets.
  5. The alert credentials are secrets listed in [operations](../operations.md); the GitHub token can only create and comment on issues.
- Verification: integration test with stubbed email and GitHub clients

### REQ-NFR-020: Migrations and environment bootstrap

Database changes and environment resources are created by versioned, repeatable steps.

- Phase: 1
- Priority: must
- Status: planned
- Source: Readiness assessment; ADR 0020
- Depends on: REQ-NFR-002
- Acceptance criteria:
  1. The bootstrap script creates every missing resource of an environment, and a second run changes nothing and reports no drift.
  2. Migrations are numbered SQL files, applied in order before the Worker that needs them, and are never edited after they have been applied in production.
  3. A migration keeps the previous Worker version working (add first, remove in a later migration after the old version is gone).
  4. A test applies all migrations to an empty local database and checks that the tables and columns the contracts in `packages/models` need exist.
  5. Each environment's token and account ID are secrets listed in [operations](../operations.md), with the least permissions the environment needs.
- Verification: integration test of the migrations and the bootstrap against local bindings
