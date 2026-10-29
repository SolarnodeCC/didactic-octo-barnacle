---
title: Screen inventory and navigation
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-DASH-001, REQ-DASH-002, REQ-DASH-003, REQ-DASH-007, REQ-DASH-008, REQ-DASH-009, REQ-DASH-010, REQ-DASH-011, REQ-DASH-012, REQ-DASH-014, REQ-ACC-003, REQ-ACC-004, REQ-ACC-010, REQ-ACC-011, REQ-ADM-001, REQ-ADM-002, REQ-ADM-003]
---

# Screen inventory and navigation

## Inventory

| # | Screen | Path | Roles | Requirements |
|---|---|---|---|---|
| 1 | Sign in | `/sign-in` | public | REQ-ACC-004 |
| 2 | Check your email | `/sign-in/sent` | public | REQ-ACC-004 |
| 3 | Continue | `/link/continue` | public | REQ-ACC-004 |
| 4 | Link problem (expired, used, invalid) | `/link/problem` | public | REQ-ACC-002, REQ-ACC-004 |
| 5 | Create account | `/welcome` | invited | REQ-ACC-003 |
| 6 | Home | `/` | all | REQ-DASH-011 |
| 7 | Opportunities | `/opportunities` | all | REQ-DASH-002, REQ-DASH-007 |
| 8 | Opportunity detail | `/opportunities/:id` | all | REQ-DASH-001, REQ-DASH-007, REQ-DASH-009 |
| 9 | Priority matrix | `/matrix` | all | REQ-DASH-010 |
| 10 | Trends | `/trends` | all | REQ-DASH-003 |
| 11 | Account settings | `/settings` | all | REQ-ACC-010, REQ-ACC-008 |
| 12 | Usage and cost | `/admin/usage` | admin | REQ-DASH-008 |
| 13 | Pipeline health | `/admin/pipeline` | admin | REQ-DASH-012, REQ-ADM-002 |
| 14 | Invitations | `/admin/invitations` | admin | REQ-ACC-002, REQ-ACC-007 |
| 15 | Users | `/admin/users` | admin | REQ-ACC-006, REQ-NFR-012 |
| 16 | Audit log | `/admin/audit` | admin | REQ-ACC-009 |
| 17 | Opportunity operations | `/admin/operations` | admin | REQ-ADM-001, REQ-ADM-002, REQ-ADM-003 |
| 18 | Terms, privacy, support | `/legal/terms`, `/legal/privacy`, `/support` | public | REQ-ACC-011 |
| 19 | System pages | not found, session expired, error | all | REQ-DASH-014 |
| 20 | Review queue | `/review` | analyst, admin | REQ-DASH-013 (later) |

Screen 20 is `later` and is not built in the MVP.

## Navigation

```text
Top bar (signed in):  Home | Opportunities | Matrix | Trends | [Admin ▾] | Account ▾
Admin menu (admin):   Pipeline health | Usage and cost | Operations | Invitations | Users | Audit log
Account menu:         Settings | Sign out
Footer (every page):  Terms | Privacy | Support
```

- The Admin menu is not rendered for other roles. A direct request to an admin path by another role shows the not-found page (REQ-DASH-014).
- An unauthenticated request to any signed-in path redirects to sign in and returns to the requested path after sign-in (REQ-DASH-014).
- The opportunity list, matrix, and trends share one filter bar (industry, band, publication date, review state). The filters live in the URL so a view can be shared.
- The detail page is reached from Home, the list, the matrix (activating a point), and search results in later work.

## Screen notes

| Screen | Content | Primary action | Exits |
|---|---|---|---|
| Sign in | Email field, Send link button, no registration form | Send link | Check your email |
| Check your email | The same text for every address; resend after 60 seconds | Resend | Sign in |
| Continue | One button, Continue, because mail scanners open links | Continue | Home, or Create account |
| Link problem | Reason in plain words without revealing whether an account exists; a request-new-link action | Request a new link | Sign in |
| Create account | Email read-only, name (1 to 100 characters), terms and privacy checkbox | Create account | Home |
| Home | New since last visit, High and Exceptional count, total, top 3 to 5, last data update | Open an opportunity | Detail, list |
| Opportunities | Table of score, band, title, startup name, industry, publication date, review state; sort, filter, cursor pagination | Open an opportunity | Detail |
| Opportunity detail | Header (title, score, band, labels), five categories with explanation and evidence, concept and business case, next steps, source publication, agent outputs, review panel, status panel (pursued, parked, rejected, with a note), brief export | Review the score; export brief | List |
| Priority matrix | Scatter of Technical Feasibility against Market Potential, quadrant counts, table alternative | Open a point | Detail |
| Trends | Opportunities per industry over time; publications per topic over time; date range | Change range | none |
| Account settings | Name, email read-only, role, recent sign-ins, end other sessions, delete account | Save name | none |
| Usage and cost | Date range, totals, per day against budget, by step and agent, estimate labels | Change range | Pipeline health |
| Pipeline health | Per source: last run, counts, failures; incomplete count; budget stops; failed candidates with a rerun action | Rerun a candidate | Usage and cost |
| Invitations | Create (email, role), list with status, resend, revoke, delivery problems | Invite | none |
| Users | List with role and status, change role, deactivate; the last admin is protected | Change role | Audit log |
| Audit log | Time-ordered events with actor and action, filter by action | Filter | none |
| Opportunity operations | Search by title or ID, hide or unhide with reason, rerun, start a rescore, choose the active score model | Hide | Detail |
| Legal | Terms and privacy policy with version and date; support contact | none | none |

## Brief export

The brief (REQ-DASH-009) is a print-ready HTML page at `/opportunities/:id/brief` in the MVP; a PDF renderer is a later change. It is available to every role and is not offered for incomplete opportunities.
