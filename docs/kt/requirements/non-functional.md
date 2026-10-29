---
title: Non-functional requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
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
  1. Every runtime component is deployed as a Cloudflare Worker, Workflow, or Pages project.
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

### REQ-NFR-005: Cost budget

Model spending stays within a configured budget.

- Phase: 2
- Priority: must
- Status: planned
- Source: KT review of cost and volume
- Depends on: REQ-NFR-003
- Acceptance criteria:
  1. A daily budget for model calls is configured per environment.
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
  3. A failed scheduled run raises an alert.
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
  2. Agents have no tools that write data or send messages outside the pipeline.
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
  2. Access is granted only to users created from an invitation and can be revoked without a deployment (REQ-ACC-006).
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
  2. User data is limited to the name and email address that accounts need (REQ-ACC-003), the sign-in records, and REQ-DASH-004.
  3. The processing of personal data is described in the security document.
- Verification: code review

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
