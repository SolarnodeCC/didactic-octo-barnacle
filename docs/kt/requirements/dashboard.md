---
title: Dashboard requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
---

# Dashboard requirements

### REQ-DASH-001: Opportunity dashboard

A web dashboard shows the scored opportunities.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4 and Technology Stack (Next.js on Cloudflare Pages)
- Depends on: REQ-API-001, REQ-API-002
- Acceptance criteria:
  1. Each opportunity shows its score, band, startup concept, next steps, and source publication with a link to the source.
  2. Each opportunity shows its five category values with their explanation and evidence (REQ-SCORE-004).
  3. An opportunity links to the agent outputs it was built from.
  4. Competitors that were not verified, and market figures that are estimates, are labeled as such.
- Verification: end-to-end test

### REQ-DASH-002: Opportunity ranking

Opportunities can be ranked and filtered.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4
- Acceptance criteria:
  1. Opportunities are sorted by score by default, and ties are sorted by publication date, newest first.
  2. Opportunities can be filtered by target industry, band, and publication date.
  3. Results are paginated.
- Verification: end-to-end test

### REQ-DASH-003: Trend analysis

The dashboard shows how research topics and opportunities develop over time.

- Phase: 4
- Priority: should
- Status: planned
- Source: README roadmap phase 4
- Acceptance criteria:
  1. The number of opportunities per industry is shown over time.
  2. The number of publications per research topic is shown over time, using the OpenAlex topic of each publication.
  3. Trends can be filtered by date range.
- Verification: end-to-end test

### REQ-DASH-006: Accessibility

The dashboard is usable with a keyboard and a screen reader.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of non-functional requirements
- Acceptance criteria:
  1. The flows in REQ-DASH-001 and REQ-DASH-002, and the sign-in, create-account, and settings flows (REQ-ACC-003, REQ-ACC-004, REQ-ACC-010), have no WCAG 2.2 level A or AA violations in an automated accessibility check.
  2. Score bands are not shown by color alone.
- Verification: end-to-end test with an automated accessibility check

### REQ-DASH-004: Opportunity feedback

Users can record what happened to an opportunity.

- Phase: later
- Priority: could
- Status: planned
- Source: overview long-term objective (feedback on pursued opportunities)
- Acceptance criteria:
  1. A user can mark an opportunity as pursued, parked, or rejected, with an optional reason.
  2. Feedback is stored with the user and the date, and can be exported for score calibration (REQ-SCORE-006).
- Verification: end-to-end test

### REQ-DASH-005: Organization profile

Strategic relevance can be computed for one organization.

- Phase: later
- Priority: could
- Status: planned
- Source: overview long-term objective (questions for a single organization)
- Acceptance criteria:
  1. An organization profile holds its industries, focus areas, and region.
  2. With a profile selected, the dashboard ranks opportunities by relevance to that profile.
- Verification: end-to-end test

### REQ-DASH-007: Home

A landing page shows what is new since the user's last visit.

- Phase: 4
- Priority: should
- Status: planned
- Source: screen specification for the signed-in experience
- Depends on: REQ-DASH-001, REQ-DASH-002
- Acceptance criteria:
  1. Home shows the number of opportunities scored since the user's last visit, how many of them are High or Exceptional, the total number of scored opportunities, and the top 3 to 5 opportunities by score.
  2. Incomplete and hidden opportunities are excluded (REQ-SCORE-005, REQ-DATA-008).
  3. The time of the latest completed data update is shown.
  4. A first visit shows totals only, and a system with no scored opportunities shows an explanation instead of zeros.
- Verification: end-to-end test

### REQ-DASH-008: Operations view

Administrators can see whether the pipeline is healthy and within budget.

- Phase: 4
- Priority: should
- Status: planned
- Source: screen specification for the administrator experience
- Depends on: REQ-NFR-005, REQ-NFR-008
- Acceptance criteria:
  1. The view shows, per source, the last run with its counts and failures, and the number of incomplete opportunities.
  2. The view shows the daily model cost against the budget, and a budget stop with its time (REQ-NFR-005).
  3. A member who requests the view is refused (REQ-ACC-006).
- Verification: end-to-end test and integration test

### REQ-DASH-009: Review queue

Reviewers can work through opportunities that need a human decision.

- Phase: later
- Priority: could
- Status: planned
- Source: screen specification for quality review
- Depends on: REQ-SCORE-005, REQ-DATA-008, REQ-SCORE-006
- Acceptance criteria:
  1. The queue lists incomplete, hidden, and flagged opportunities with the reason.
  2. A reviewer records a decision with an optional reason; it is stored with the user and the date.
  3. Decisions can be exported for score calibration (REQ-SCORE-006).
- Verification: end-to-end test

### REQ-DASH-010: System pages

Errors and expired sessions are handled the same way on every page.

- Phase: 4
- Priority: must
- Status: planned
- Source: screen specification for error states
- Depends on: REQ-NFR-007
- Acceptance criteria:
  1. A request for a page the user may not see and a request for a page that does not exist show the same wording, so that the response does not reveal whether the page exists.
  2. An expired session returns the user to sign-in and, after sign-in, to the page that was requested.
  3. Error pages show no stack traces. Administrators see a reference ID that matches the log entry.
- Verification: end-to-end test
