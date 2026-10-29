---
title: "0018: Separate the auth and admin API from the read API"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-API-003, REQ-API-004, REQ-API-005, REQ-ADM-004, REQ-NFR-014]
---

# 0018: Separate the auth and admin API from the read API

- Decision status: Accepted
- Date: 2026-10-29

## Context

The data API was described as read-only with the score review as its one write (REQ-API-004). Invitations, sign-in, account deletion, role changes, and admin operations all write data.

## Options considered

1. **A separate auth and admin surface.** The data API stays read-only apart from the review. Auth and admin routes have their own prefix, CSRF checks, and role matrix.
2. **One API with writes.** Simpler to deploy, but one large surface with mixed risk.

## Decision

Option 1. `apps/api` serves the data API under `/api/v1/` and the auth and admin API under `/auth/` and `/admin/`. Both use the same session. Each route declares its allowed roles in code, and the role matrix is a test fixture (REQ-ADM-004).

## Consequences

- The "read-only" wording now means the data API (REQ-API-001 to REQ-API-004); layers, security, and ADR 0007 say so.
- Request and response schemas for all three surfaces live in `packages/models` (REQ-API-003).
