---
title: Screen states
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-DASH-006, REQ-DASH-011, REQ-DASH-014, REQ-ACC-003, REQ-ACC-004, REQ-SCORE-007]
---

# Screen states

States that every screen handles the same way. All messages are plain text (REQ-NFR-013) and are announced to screen readers (REQ-DASH-006).

## Loading

- A skeleton of the final layout, no spinner-only pages. After 10 seconds a message says that loading takes longer than usual.

## Empty

| Screen | Empty state |
|---|---|
| Home, no scored opportunities | An explanation that the platform has not produced scored opportunities yet and when the next data update runs; no zeros (REQ-DASH-011) |
| Opportunities, no results | "No opportunities match these filters" with a Clear filters action |
| Matrix | Same text as the list; the table is empty too |
| Search | "No opportunities match this description" with a suggestion to use other words |
| Trends | "Not enough data for this range" with a suggestion to widen it |
| Pipeline health, no runs | "No runs yet" with the schedule |
| Invitations, none | "No invitations yet" and the Invite action |
| Audit log, none | "No events in this range" |

## Error

| Case | Behavior |
|---|---|
| Page not found or not allowed | The same wording and layout for both (REQ-DASH-014) |
| Session expired | Return to sign in; after sign-in, go to the requested page |
| Server error | "Something went wrong" and a reference ID that matches the log entry; admins see the ID, others may read it out to support; no stack trace |
| Rate limited | "Too many attempts, try again later"; no detail about which limit |
| Partial data (one panel fails) | The panel shows an error with Retry; the rest of the page stays |
| Conflict on review | "The score changed while you were reading. Reload to review the new score." (REQ-API-004) |
| Incomplete opportunity | The detail shows which category or step is missing; no score, no brief (REQ-SCORE-005) |
| Hidden opportunity | Admins see a hidden notice with the reason; other roles see not found (REQ-ADM-001) |

## Validation

| Field | Rule | Message |
|---|---|---|
| Email | Valid address, at most 254 characters | "Enter a valid email address" |
| Name | 1 to 100 characters, not only spaces | "Enter your name (up to 100 characters)" |
| Terms and privacy | Must be accepted | "Accept the terms and the privacy policy to continue" |
| Dispute reason | Required, at most 500 characters | "Give a reason (up to 500 characters)" |
| Confirm reason | Optional, at most 500 characters | "Keep the reason under 500 characters" |
| Status note | Optional, at most 500 characters | "Keep the note under 500 characters" |
| Hide reason | Required, 1 to 500 characters | "Give a reason for hiding" |
| Invitation role | Required, one of viewer, analyst, admin | "Choose a role" |
| Search query | 3 to 300 characters | "Enter 3 to 300 characters" |
| Date range | Start not after end; at most 24 months | "Choose a valid date range" |
| Pending invitation cap | Configured cap, default 50 | "The limit of pending invitations is reached" |
| Invitation email domain | Must be on the allowlist when one is set | "This email domain is not allowed" |

## Labels

- Estimated market figures: "Estimate". Unverified competitors: "Unverified". Scores built on estimates: "Estimate-based". Abstract-only input: "Based on the abstract".
- Every complete opportunity shows "Evidence-backed"; one whose current score has a confirming review also shows "Validated".
- A band is shown as text next to any color (REQ-DASH-006).
