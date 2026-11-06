---
title: "0058: A read route for the thin slice"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-PROC-007, REQ-API-001, REQ-ACC-001]
---

# 0058: A read route for the thin slice

- Decision status: Accepted
- Date: 2026-11-06

## Context

REQ-PROC-007 AC1 requires the thin slice to return its opportunity through the data API. The data API, with authentication, is phase 4 (REQ-API-001, REQ-ACC-001), and `apps/api` does not exist yet.

## Options considered

1. **Build the phase 4 data API early.** Authentication, roles, and the route set would all move into phase 2.
2. **Read the result from D1 directly in the slice test.** This does not show the API shape, which is the point of the slice.
3. **A minimal `apps/api` Worker with one read-only route**, in local and preview only, with the response shape of the planned opportunity detail route ([API routes](../architecture/api-routes.md)).

## Decision

Option 3.

- `GET /api/v1/opportunities/:id` returns the opportunity with its publication, candidate, agent outputs, evidence, and score, validated against `packages/models` schemas.
- The route is deployed only to local and preview. It has no authentication, and preview holds only fixture data.
- Production and staging get no route until phase 4 adds authentication. The release plan checks that.

## Consequences

- The slice shows the final output shape through the API, as REQ-PROC-007 asks.
- Phase 4 adds authentication and the other routes to the same Worker and keeps the response shape.
- `apps/api` gets its own `wrangler.toml` section. With `workers_dev` off and no route in staging or production, the hardening check stays green (REQ-NFR-021).
