---
title: Dashboard requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Dashboard requirements

### REQ-DASH-001: Opportunity dashboard

A web dashboard shows the scored opportunities.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4 and Technology Stack (Next.js on Workers, ADR 0012)
- Depends on: REQ-API-001, REQ-API-002
- Acceptance criteria:
  1. Each opportunity shows its score, band, startup concept, next steps, and source publication with a link to the source.
  2. Each opportunity shows its five category values with their explanation and evidence (REQ-SCORE-004).
  3. An opportunity links to the agent outputs it was built from.
  4. Competitors that were not verified, and market figures that are estimates, are labeled as such. A score marked `estimate-based` (REQ-SCORE-004) shows that label next to the score, and the input mode (abstract or full text) is shown.
  5. All model-generated text and URLs follow REQ-NFR-013.
- Verification: end-to-end test

### REQ-DASH-002: Opportunity ranking

Opportunities can be ranked and filtered.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4
- Acceptance criteria:
  1. Opportunities are sorted by score by default, and ties are sorted by publication date, newest first.
  2. Opportunities can be filtered by target industry, band, publication date, review state, and decision status (REQ-DASH-004). The shared filter bar in [screens](../ux/screens.md) exposes all five.
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
  2. The number of publications is shown over time for the 20 most active OpenAlex topics in the selected date range, using the OpenAlex topic of each publication; all other topics are grouped as Other.
  3. Trends can be filtered by date range of at most 24 months.
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

### REQ-DASH-004: Opportunity status

Analysts and admins can record what happened to an opportunity.

- Phase: 4
- Priority: should
- Status: planned
- Source: overview long-term objective (feedback on pursued opportunities); OQ-027
- Depends on: REQ-DASH-001, REQ-NFR-012
- Acceptance criteria:
  1. An analyst or admin can mark an opportunity as pursued, parked, or rejected, with a decision note of at most 500 characters. A viewer sees the status but has no action (REQ-NFR-012).
  2. The status is stored with the user and the date. A new entry replaces the current status; earlier entries stay in the history of the opportunity.
  3. The data API accepts the status as its second write (`POST /api/v1/opportunities/:id/status`, ADR 0021), with forbidden, not-found, and validation errors as in REQ-API-004. The list endpoint accepts the status as a filter.
  4. Entries can be exported for score calibration through `GET /api/v1/calibration/export` (ADR 0025, REQ-SCORE-006).
  5. A status does not change the score, the band, or the position in a ranking.
- Verification: integration test and end-to-end test

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

### REQ-DASH-007: Score review in the dashboard

Analysts can confirm or dispute a score from the opportunity detail view.

- Phase: 4
- Priority: should
- Status: planned
- Source: REQ-SCORE-007
- Depends on: REQ-DASH-001, REQ-API-004
- Acceptance criteria:
  1. The detail view shows the review state as a text label and the review history with users, dates, and reasons.
  2. An analyst or admin can confirm or dispute the current score and must enter a reason to dispute. A viewer sees no review action.
  3. The opportunity list can be filtered by review state. An opportunity whose current score has a confirming review is labeled Validated; every complete opportunity is labeled Evidence-backed (see the [overview](../overview.md)).
  4. A disputed opportunity stays visible and keeps its position in the ranking.
- Verification: end-to-end test

### REQ-DASH-008: Usage and cost view

Admins can see how much the platform spends on model calls and where.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of a comparable internal governance platform (token use and cost transparency)
- Depends on: REQ-NFR-011, REQ-NFR-012
- Acceptance criteria:
  1. For a selectable date range, the view shows total input tokens, output tokens, model calls, and cost.
  2. The view shows consumption per day, and spend per day against the daily budget (REQ-NFR-005).
  3. Totals can be broken down by pipeline step and by agent. For each agent, the view shows the share of calls with invalid output and the repair rate (REQ-AGENT-011), and for the platform the mean and median cost per opportunity.
  4. Costs that were computed from a price table are labeled as estimates (REQ-NFR-011).
  5. The view is visible to the admin role only and shows no per-user figures, because the pipeline, not users, makes model calls.
- Verification: end-to-end test with seeded model call records

### REQ-DASH-009: Opportunity brief

A user can open a one-page, print-ready brief of an opportunity and save it as a PDF from the browser.

- Phase: 4
- Priority: could
- Status: planned
- Source: KT review of a comparable internal governance platform (board pack export)
- Depends on: REQ-DASH-001, REQ-SCORE-004
- Acceptance criteria:
  1. The brief is a print-ready HTML page at `/opportunities/:id/brief` with a print stylesheet; the platform generates no PDF file in the MVP. It holds the title, startup concept summary, score, band, the five category values with their explanation, business case summary, next steps, source publication with a link, evidence quotes, review state, score model version, and the date it was generated.
  2. Estimated market figures and unverified competitors are labeled as in REQ-DASH-001.
  3. The brief is built from stored data without a model call, so it matches what the dashboard shows.
  4. The brief contains no stored PDF or full text beyond evidence quotes of at most 500 characters (REQ-DATA-010).
  5. An incomplete opportunity cannot be exported.
  6. The export is available to every role.
- Verification: unit tests of the brief content and end-to-end test

### REQ-DASH-010: Priority matrix

The dashboard plots opportunities by Market Potential and Technical Feasibility.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of a comparable internal governance platform (priority matrix)
- Depends on: REQ-DASH-002, REQ-API-001
- Acceptance criteria:
  1. Each complete opportunity is one point, with Technical Feasibility on the x axis and Market Potential on the y axis, both from the category values of its score (0 to 100). No model call is made to draw the chart.
  2. Two threshold lines divide the chart into four named quadrants. The thresholds default to 60 for Market Potential and 60 for Technical Feasibility, and the quadrants are named Pursue now (both high), Needs technology (high market, low feasibility), Quick win (low market, high feasibility), and Monitor (both low). Thresholds and names are configuration, tuned on the calibration set (REQ-SCORE-006). The chart shows the thresholds in use, and each quadrant shows its count. A value equal to a threshold counts as high.
  3. A point shows its band by a label or marker shape in addition to color (REQ-DASH-006). Hover and keyboard focus show the title, score, and category values, and activating a point opens the detail view (REQ-DASH-001).
  4. The filters of REQ-DASH-002 apply to the chart.
  5. A table lists the same points with their quadrant, as the accessible alternative to the chart.
  6. Incomplete opportunities are not plotted (REQ-SCORE-005).
- Verification: unit tests of quadrant assignment on boundary values and end-to-end test

### REQ-DASH-011: Home

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

### REQ-DASH-012: Pipeline health

Admins can see whether ingestion and the pipeline are healthy.

- Phase: 4
- Priority: should
- Status: planned
- Source: screen specification for the administrator experience
- Depends on: REQ-NFR-005, REQ-NFR-008, REQ-NFR-012
- Acceptance criteria:
  1. The view shows, per source, the last run with its counts and failures, and the number of incomplete opportunities.
  2. The view shows when a budget stop happened (REQ-NFR-005) and links to the usage and cost view (REQ-DASH-008) for cost.
  3. A user who is not an admin is refused (REQ-NFR-012).
- Verification: end-to-end test and integration test

### REQ-DASH-013: Review queue

Analysts and admins can work through opportunities that need a human decision.

- Phase: later
- Priority: could
- Status: planned
- Source: [screen specification](../ux/screens.md) for quality review
- Depends on: REQ-SCORE-005, REQ-DATA-008, REQ-SCORE-006, REQ-DASH-007
- Acceptance criteria:
  1. The queue lists incomplete, hidden, and flagged opportunities with the reason.
  2. An analyst or admin records a decision with an optional reason; it is stored with the user and the date.
  3. Decisions can be exported for score calibration (REQ-SCORE-006).
- Verification: end-to-end test

### REQ-DASH-014: System pages

Errors and expired sessions are handled the same way on every page.

- Phase: 4
- Priority: must
- Status: planned
- Source: [screen specification](../ux/screens.md) for error states
- Depends on: REQ-NFR-007
- Acceptance criteria:
  1. A request for a page the user may not see and a request for a page that does not exist show the same wording, so that the response does not reveal whether the page exists.
  2. An expired session returns the user to sign-in and, after sign-in, to the page that was requested.
  3. Error pages show no stack traces. Administrators see a reference ID that matches the log entry.
- Verification: end-to-end test

### REQ-DASH-015: Search by meaning

A user can search opportunities by describing a problem or technology in words.

- Phase: 4
- Priority: should
- Status: planned
- Source: Readiness assessment; REQ-PROC-003
- Depends on: REQ-API-006, REQ-DASH-002
- Acceptance criteria:
  1. A search box on the Opportunities screen sends the query to REQ-API-006 and shows the results in the list layout, ordered by similarity, with the similarity as text.
  2. The filters of REQ-DASH-002 apply to the results, and clearing the query returns to the score ranking.
  3. A query with no results shows the empty state; a query that is too short or too long shows the validation message (see [screen states](../ux/states.md)).
  4. The search box is keyboard operable and labeled for screen readers (REQ-DASH-006).
- Verification: end-to-end test
