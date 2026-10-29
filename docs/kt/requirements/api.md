---
title: API requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# API requirements

The data API in `apps/api` is the only way the dashboard reads data. It is read-only in the MVP, except for score reviews (REQ-API-004) and opportunity status (REQ-DASH-004). Sign-in, account, and admin operations are served by separate routes (ADR 0018, REQ-API-005).

### REQ-API-001: List opportunities

The API returns scored opportunities with sorting, filtering, and pagination.

- Phase: 4
- Priority: must
- Status: planned
- Source: REQ-DASH-002
- Acceptance criteria:
  1. The list supports the sort order and filters of REQ-DASH-002.
  2. Pagination uses a cursor and a maximum page size of 100 (default 25).
  3. Each item holds the score, band, the five category values, title, startup name, industries, and source publication.
- Verification: integration test and contract test

### REQ-API-002: Opportunity detail with provenance

The API returns one opportunity with everything it was built from.

- Phase: 4
- Priority: must
- Status: planned
- Source: overview principle Reliability
- Acceptance criteria:
  1. The response holds the category values and their explanation (REQ-SCORE-004), every agent output with its model and prompt version, and the source publication (one per opportunity, ADR 0015) with the related publications used as context.
  2. An unknown opportunity ID returns a not-found error.
- Verification: integration test and contract test

### REQ-API-003: Versioned API contract

Request and response shapes are defined once and versioned.

- Phase: 4
- Priority: must
- Status: planned
- Source: test strategy (API contract tests)
- Acceptance criteria:
  1. Request and response schemas live in `packages/models` and are used by the API and the dashboard.
  2. Errors use one documented error shape: `{ error: { code, message, referenceId } }` with a stable `code` per case and no stack trace.
  3. A breaking change gets a new API version; the previous version keeps working until the dashboard no longer uses it.
- Verification: contract test

### REQ-API-004: Score review endpoint

The API accepts reviews of scores. With opportunity status (REQ-DASH-004), it is one of the two write operations of the data API in the MVP.

- Phase: 4
- Priority: should
- Status: planned
- Source: REQ-SCORE-007
- Depends on: REQ-API-001, REQ-API-002, REQ-SCORE-007, REQ-NFR-012
- Acceptance criteria:
  1. An analyst or admin can submit a review for the current score of an opportunity. A viewer gets a forbidden error (REQ-NFR-012), an unknown opportunity or score ID gets a not-found error, and a review for a score that is no longer current gets a conflict error.
  2. A repeated review by the same user for the same score is stored as a new entry; the latest entry defines the review state, and earlier entries stay in the history.
  3. The list endpoint (REQ-API-001) returns the review state and accepts it as a filter. The detail endpoint (REQ-API-002) returns the review history with users, dates, and reasons.
- Verification: integration test and contract test

### REQ-API-005: Auth and admin API

Sign-in, account, and admin operations are served by routes separate from the data API.

- Phase: 4
- Priority: must
- Status: planned
- Source: ADR 0018
- Depends on: REQ-API-003, REQ-ACC-004, REQ-NFR-014
- Acceptance criteria:
  1. The routes are under `/auth/` and `/admin/`, use the same session as the data API, and are described by the same versioned schemas in `packages/models` (REQ-API-003).
  2. Each route lists its allowed roles in code; the role matrix is a test fixture, and a request outside the role gets a forbidden error (REQ-NFR-012).
  3. The errors use the shape of REQ-API-003. A response never reveals whether an account exists (REQ-ACC-004).
  4. The OpenAPI document generated from the schemas is committed and checked in CI for drift.
- Verification: contract test and integration test of the role matrix
