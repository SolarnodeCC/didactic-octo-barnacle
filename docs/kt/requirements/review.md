---
title: Output review requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-24
related: [REQ-PROC-004, REQ-PROC-005, REQ-NFR-013, REQ-NFR-014, REQ-NFR-021, REQ-TEST-005, REQ-TEST-006]
---

# Output review requirements

The owner reviews what the model-backed steps produce (triage decisions and extraction candidates) in a small interactive tool, before the phase 4 dashboard exists ([ADR 0115](../decisions/0115-owner-review-frontend.md)). The tool is `apps/review`, one Worker with static assets, served at `review.wispel.cc` behind Cloudflare Access and reading the staging database. It is an internal tool for one reviewer; it does not replace the dashboard, accounts, or the data API of phase 4.

### REQ-REV-001: Review list

The reviewer sees the processed publications in a list they can filter.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-23 (ADR 0115)
- Depends on: REQ-PROC-005
- Acceptance criteria:
  1. The list shows every publication with a triage decision, newest decision first, with its title, triage outcome, triage reason, number of candidates, and whether it was reviewed.
  2. The list can be filtered by triage outcome (accepted or rejected), triage reason, reviewed or not reviewed (every target of the publication has a current verdict), prompt version of the triage or extraction, and day of the triage decision.
  3. The list is paginated with a cursor of at most 50 rows per page.
- Verification: integration test

### REQ-REV-002: Review detail

The reviewer sees one publication with all the model output about it.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-23 (ADR 0115)
- Depends on: REQ-REV-001, REQ-PROC-004
- Acceptance criteria:
  1. The detail shows the title, abstract, publication date, and links to the DOI and arXiv record when they exist.
  2. The detail shows the triage decision: outcome, score, reason, the five signals, notes, model, and prompt version.
  3. The detail shows the extraction result (input mode, confidence, notes, model, prompt version) and every candidate with its finding, customer, why-now, current alternative, and their quotes.
  4. A quote that occurs in the abstract is highlighted in the abstract, using the same normalisation as the quote check (ADR 0064).
  5. All model-generated and source-derived text is rendered as plain text, and only `https` URLs are links (REQ-NFR-013).
- Verification: integration test and unit test

### REQ-REV-003: Record a verdict

The reviewer records whether a triage decision or a candidate is right.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-23 (ADR 0115)
- Depends on: REQ-REV-002
- Acceptance criteria:
  1. A verdict on a triage decision or a candidate is `correct`, `incorrect`, or `unsure`, with an optional note of at most 500 characters and an optional corrected value of at most 2,000 characters.
  2. A verdict is stored with the reviewer's opaque Access subject, the time, and the model and prompt version of the output it judges. A new verdict on the same target replaces the current one in the list and the detail; earlier verdicts stay stored.
  3. A verdict on a target that does not exist is refused with not-found, and an invalid body with a validation error.
  4. The detail page can be worked with the keyboard: next and previous publication, and one key per verdict.
- Verification: integration test

### REQ-REV-004: Review summary and export

The reviewer sees how often the model output was right and can export the verdicts.

- Phase: 2
- Priority: could
- Status: in-progress
- Source: owner request of 2026-11-23 (ADR 0115); golden-set review (ADR 0072)
- Depends on: REQ-REV-003
- Acceptance criteria:
  1. The summary shows, per step (triage, candidate) and prompt version, the number of current verdicts of each kind and the share judged correct among the correct and incorrect ones.
  2. The export returns every stored verdict as JSON lines, oldest first, with the target, publication, verdict, note, corrected value, model, prompt version, and time.
- Verification: integration test

### REQ-REV-005: Access to the review tool

Only the owner can reach the review tool.

- Phase: 2
- Priority: must
- Status: in-progress
- Source: ADR 0115; REQ-NFR-021
- Acceptance criteria:
  1. The hostname is protected by a Cloudflare Access application that allows only the owner.
  2. The Worker also verifies the Access token (`Cf-Access-Jwt-Assertion`) of every API request: an RS256 signature from the team's published keys, the audience tag, the issuer, and the expiry. A request without a valid token gets 401 and no data; while the team domain or audience is not configured, every API request is refused.
  3. A state-changing request needs a same-origin `Origin` header (REQ-NFR-014). Responses carry a Content Security Policy without inline scripts, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and a `Referrer-Policy`.
  4. The Worker has no workers.dev address and no preview URLs, and only staging has a route.
- Verification: unit test, integration test, and the hardening check
