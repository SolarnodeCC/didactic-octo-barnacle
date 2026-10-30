---
title: "0025: MVP export policy"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DASH-009, REQ-SCORE-006, REQ-DASH-004, REQ-NFR-016]
---

# 0025: MVP export policy

- Decision status: Accepted
- Date: 2026-10-29

## Context

The overview non-goal said the brief was the only export, while REQ-DASH-004, REQ-SCORE-006, and privacy described calibration and DSAR exports without formats. That contradiction blocked API design.

## Options considered

1. **Brief only.** Drop calibration and DSAR export ACs. Rejected: calibration and GDPR access need a machine-readable path.
2. **Three named exports.** Brief for users; calibration JSON lines for analysts; DSAR JSON for admins. No bulk opportunity list dump.

## Decision

Option 2. MVP exports are exactly:

| Export | Audience | Format | Route |
|---|---|---|---|
| Opportunity brief | every role | print-ready HTML (browser print to PDF) | `/opportunities/:id/brief` and `GET /api/v1/opportunities/:id/brief` |
| Calibration set | analyst, admin | JSON lines of disputed reviews and status entries | `GET /api/v1/calibration/export` |
| User DSAR | admin | JSON of one user's personal data | `GET /admin/dsar/:userId` |

A bulk list or spreadsheet export of opportunities remains out of scope (later).

## Consequences

- Overview non-goals name these three exports and forbid bulk list export.
- Privacy DSAR is the admin route above, not an undocumented side channel.
- Glossary "opportunity brief" means HTML, not a server-generated PDF.
