---
title: Dashboard requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Dashboard requirements

### REQ-DASH-001: Opportunity dashboard

A web dashboard shows the scored opportunities.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4 and Technology Stack (Next.js on Cloudflare Pages)
- Acceptance criteria:
  1. Each opportunity shows its score, band, startup concept, and source publication.
  2. An opportunity links to the agent outputs it was built from.
- Verification: end-to-end test

### REQ-DASH-002: Opportunity ranking

Opportunities can be ranked and filtered.

- Phase: 4
- Priority: must
- Status: planned
- Source: README roadmap phase 4
- Acceptance criteria:
  1. Opportunities are sorted by score by default.
  2. Opportunities can be filtered by target industry and band.
- Verification: end-to-end test

### REQ-DASH-003: Trend analysis

The dashboard shows how research topics and opportunities develop over time.

- Phase: 4
- Priority: should
- Status: planned
- Source: README roadmap phase 4
- Acceptance criteria:
  1. The number of opportunities per industry is shown over time.
  2. Trends can be filtered by date range.
- Verification: end-to-end test
