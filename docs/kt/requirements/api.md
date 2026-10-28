---
title: API requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# API requirements

The API in `apps/api` is the only way the dashboard reads data. It is read-only in the MVP.

### REQ-API-001: List opportunities

The API returns scored opportunities with sorting, filtering, and pagination.

- Phase: 4
- Priority: must
- Status: planned
- Source: REQ-DASH-002
- Acceptance criteria:
  1. The list supports the sort order and filters of REQ-DASH-002.
  2. Pagination uses a cursor and a maximum page size.
  3. Each item holds the score, band, title, startup name, industries, and source publication.
- Verification: integration test and contract test

### REQ-API-002: Opportunity detail with provenance

The API returns one opportunity with everything it was built from.

- Phase: 4
- Priority: must
- Status: planned
- Source: overview principle Reliability
- Acceptance criteria:
  1. The response holds the category values and their explanation (REQ-SCORE-004), every agent output with its model and prompt version, and the source publications.
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
  2. Errors use one documented error shape.
  3. A breaking change gets a new API version; the previous version keeps working until the dashboard no longer uses it.
- Verification: contract test
