---
title: User journeys and personas
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-012, REQ-DASH-001, REQ-DASH-002, REQ-DASH-004, REQ-DASH-007, REQ-ACC-003]
---

# User journeys and personas

Persona depth is in [personas](personas.md). Role mapping:

| Persona ([overview](../overview.md)) | Role | Why |
|---|---|---|
| Innovation lead | viewer | Reads a ranked shortlist and exports a brief |
| Consultant | viewer | Reads evidence and competitors, exports a brief for a client |
| Venture builder | viewer or analyst | Reads concepts; an analyst also confirms or disputes scores |
| Domain reviewer | analyst | Judges output, records reviews, and sets opportunity status (REQ-DASH-004) |
| Platform operator | admin | Invites users, watches pipeline and cost, hides or reruns |

## Journeys

| # | Journey | Steps | Success |
|---|---|---|---|
| J1 | Join | Admin invites an email → person opens the link → Continue → Create account (name, terms) → Home | Account exists with the invited role |
| J2 | Return | Sign in → enter email → open link → Continue → Home | Signed in without a password |
| J3 | Find an opportunity | Home → Opportunities → filter by industry, band, review state, or status, or search by describing a problem → open detail | The user sees the score, why, and the source |
| J4 | Decide | Detail → read categories and evidence → read next steps → export brief | A one-page brief |
| J5 | Review a score | Detail → Confirm or Dispute with a reason | The review is stored; the score and ranking do not change |
| J6 | Explore | Matrix → hover or focus a point → open detail; Trends → change range | Patterns across opportunities |
| J7 | Fix bad output | Pipeline health or Operations → find the opportunity → Hide with a reason | It leaves every list and ranking |
| J8 | Recover | Pipeline health → failed candidate → Rerun | A new run completes or fails with a reason |
| J9 | Control cost | Usage and cost → range → spend against budget | The admin sees where money went |
| J10 | Leave | Settings → Delete account → confirm | Personal data is removed (REQ-ACC-008) |
| J11 | Record status | Detail → status panel → pursued, parked, or rejected with a note | Latest status visible; history retained (REQ-DASH-004) |
| J12 | Invite | Admin → Invitations → create with email and role → invitee completes J1 | Pending invitation appears; delivery problems surface |
| J13 | Session expired | Any signed-in action after expiry → system page → Sign in → return to path | User continues without data loss of draft (no drafts in MVP) |

## Notes

- "Evidence-backed" and "validated" are separate labels ([overview](../overview.md)). Every complete opportunity is evidence-backed; it is validated only when its current score has a confirming review. A review is optional and annotates the score (ADR 0007); the opportunity detail shows both labels, and the list can filter by review state (REQ-DASH-007).
