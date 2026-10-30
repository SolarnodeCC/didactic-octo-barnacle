---
title: "0021: Data API writes are score review and opportunity status"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-API-004, REQ-DASH-004, REQ-NFR-012]
---

# 0021: Data API writes are score review and opportunity status

- Decision status: Accepted
- Date: 2026-10-29

## Context

ADR 0007 and ADR 0018 described the data API as having one write (score review). REQ-DASH-004 adds opportunity status as a second data-API write. Layers, security, and repository-layout still said "one write," which contradicted the approved requirements.

## Options considered

1. **Keep one write.** Move status under `/admin/`. Rejected: analysts must set status (REQ-DASH-004, REQ-NFR-012) and analysts are not admins.
2. **Two data-API writes.** Score review and opportunity status under `/api/v1/`; auth and admin remain separate (ADR 0018).

## Decision

Option 2. The data API has exactly two write operations in the MVP: `POST /api/v1/opportunities/:id/reviews` and `POST /api/v1/opportunities/:id/status`. ADR 0007's annotate-only rule for reviews still stands. The "one write" wording in ADR 0004, ADR 0007, and ADR 0018 is superseded by this ADR for write count only.

## Consequences

- [api routes](../architecture/api-routes.md), [layers](../architecture/layers.md), [security](../architecture/security.md), and [repository layout](../architecture/repository-layout.md) name both writes.
- Auth and admin writes stay on `/auth/` and `/admin/`.
- Calibration export remains a read under `/api/v1/calibration/export` (ADR 0025).
