---
title: Security requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Security requirements

Secrets, untrusted input, authenticated access, roles, safe rendering, request integrity, and the organization key. Security measures are described in [security](../../architecture/security.md).

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
