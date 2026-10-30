---
title: API route catalog
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-API-001, REQ-API-002, REQ-API-003, REQ-API-004, REQ-API-005, REQ-API-006, REQ-DASH-004, REQ-NFR-012, REQ-NFR-014, REQ-ADM-004]
---

# API route catalog

Concrete routes for `apps/api`. Request and response bodies are Zod schemas in `packages/models` (REQ-API-003). OpenAPI is generated from those schemas and committed (REQ-API-005). This catalog is the source of path and method names until the OpenAPI file exists in code.

## Conventions

- Data API prefix: `/api/v1/`. Auth prefix: `/auth/`. Admin prefix: `/admin/`.
- Session cookie is shared across prefixes (REQ-ACC-004, ADR 0018).
- Every state-changing method (`POST`, `PATCH`, `DELETE`) requires a valid CSRF token and a matching `Origin` (REQ-NFR-014).
- Errors use `{ error: { code, message, referenceId } }` (REQ-API-003). Stable codes are listed below.
- Pagination uses `cursor` and `limit` (default 25, max 100) unless noted.

## Data API

| Method | Path | Roles | Purpose | Requirement |
|---|---|---|---|---|
| GET | `/api/v1/opportunities` | viewer, analyst, admin | List with sort, filters (industry, band, publication date, review state, status), cursor | REQ-API-001, REQ-DASH-002, REQ-DASH-004 |
| GET | `/api/v1/opportunities/search` | viewer, analyst, admin | Semantic search `q` (3–300 chars) plus list filters | REQ-API-006 |
| GET | `/api/v1/opportunities/:id` | viewer, analyst, admin | Detail with provenance, agent outputs, review history, status history | REQ-API-002 |
| POST | `/api/v1/opportunities/:id/reviews` | analyst, admin | Body: `{ scoreId, state, reason? }`; conflict if score not current | REQ-API-004 |
| POST | `/api/v1/opportunities/:id/status` | analyst, admin | Body: `{ status, note? }`; status is `pursued`, `parked`, or `rejected` | REQ-DASH-004 |
| GET | `/api/v1/opportunities/:id/brief` | viewer, analyst, admin | Print-ready HTML brief (also served as a dashboard route) | REQ-DASH-009 |
| GET | `/api/v1/home` | viewer, analyst, admin | Counts since last visit, top opportunities, last data update | REQ-DASH-011 |
| GET | `/api/v1/trends` | viewer, analyst, admin | Opportunities per industry and publications per topic over a date range | REQ-DASH-003 |
| GET | `/api/v1/matrix` | viewer, analyst, admin | Points for the priority matrix with shared filters | REQ-DASH-010 |
| GET | `/api/v1/calibration/export` | analyst, admin | JSON lines of disputed reviews and status entries for calibration | REQ-SCORE-006, REQ-DASH-004 |

Hidden and incomplete opportunities are excluded from list, search, home, trends, and matrix unless an admin sets `includeHidden=true` on admin-only variants under `/admin/`.

## Auth API

| Method | Path | Roles | Purpose | Requirement |
|---|---|---|---|---|
| GET | `/auth/csrf` | public | Issues a CSRF token for the session or anonymous cookie | REQ-NFR-014 |
| POST | `/auth/sign-in` | public | Body: `{ email }`; always same success response | REQ-ACC-004 |
| POST | `/auth/sign-in/resend` | public | Resend after 60 seconds | REQ-ACC-004 |
| GET | `/auth/link/continue` | public | Shows Continue; does not consume the token | REQ-ACC-004 |
| POST | `/auth/link/continue` | public | Consumes the sign-in or invitation token | REQ-ACC-004 |
| POST | `/auth/account` | invited | Body: `{ name, termsVersion }`; creates the user | REQ-ACC-003 |
| POST | `/auth/sign-out` | authenticated | Ends the current session | REQ-ACC-004 |
| GET | `/auth/me` | authenticated | Current user, role, organization | REQ-ACC-010 |
| PATCH | `/auth/me` | authenticated | Body: `{ name }` | REQ-ACC-010 |
| GET | `/auth/me/sessions` | authenticated | Recent sign-ins | REQ-ACC-010 |
| POST | `/auth/me/sessions/revoke-others` | authenticated | End other sessions | REQ-ACC-010 |
| DELETE | `/auth/me` | authenticated | Delete account | REQ-ACC-008 |
| POST | `/auth/webhooks/resend` | provider | Bounce and complaint events; signature verified | REQ-ACC-007 |

## Admin API

| Method | Path | Roles | Purpose | Requirement |
|---|---|---|---|---|
| GET | `/admin/usage` | admin | Cost and token totals by day, step, agent | REQ-DASH-008 |
| GET | `/admin/pipeline` | admin | Per-source run health, incomplete count, failed candidates | REQ-DASH-012 |
| POST | `/admin/candidates/:id/rerun` | admin | Rerun from first failed step | REQ-ADM-002 |
| GET | `/admin/invitations` | admin | List invitations | REQ-ACC-002 |
| POST | `/admin/invitations` | admin | Body: `{ email, role }` | REQ-ACC-002 |
| POST | `/admin/invitations/:id/resend` | admin | Resend invitation | REQ-ACC-002 |
| POST | `/admin/invitations/:id/revoke` | admin | Revoke invitation | REQ-ACC-002 |
| GET | `/admin/users` | admin | List users | REQ-ACC-006 |
| PATCH | `/admin/users/:id` | admin | Body: `{ role? }` or `{ status: "deactivated" }` | REQ-ACC-006 |
| GET | `/admin/audit` | admin | Time-ordered audit events | REQ-ACC-009 |
| POST | `/admin/opportunities/:id/hide` | admin | Body: `{ reason }` | REQ-ADM-001 |
| POST | `/admin/opportunities/:id/unhide` | admin | Body: `{ reason }` | REQ-ADM-001 |
| POST | `/admin/opportunities/rescore` | admin | Body: `{ scoreModelVersion }` starts a rescore job | REQ-ADM-003 |
| PATCH | `/admin/score-models/active` | admin | Body: `{ version }` | REQ-ADM-003 |
| POST | `/admin/queue/replay` | admin | Body: `{ messageId }` replays a dead-lettered message | REQ-DATA-011 |
| GET | `/admin/dsar/:userId` | admin | JSON export of one user's personal data | REQ-NFR-016 |
| POST | `/admin/authors/:id/erase` | admin | Body: `{ reason }` removes author personal data | REQ-NFR-016 |

## Error codes

| Code | HTTP | When |
|---|---|---|
| `unauthorized` | 401 | No valid session |
| `forbidden` | 403 | Role, CSRF, or Origin failure |
| `not_found` | 404 | Unknown resource; also for admin paths when the role is not admin |
| `validation_error` | 400 | Bad body or query |
| `conflict` | 409 | Stale score review, token already used, last-admin protected |
| `rate_limited` | 429 | Per-user or global limit |
| `gone` | 410 | Expired invitation or sign-in link |

## CSRF issuance

`GET /auth/csrf` sets a readable CSRF cookie (or returns `{ token }` in JSON for the dashboard bootstrap) that is not HttpOnly so the client can copy it into the `X-CSRF-Token` header. The server compares header to cookie with a constant-time check. Token lifetime matches the session, or 24 hours for anonymous sign-in forms.
