---
title: Output review requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-24
related: [REQ-PROC-004, REQ-PROC-005, REQ-NFR-013, REQ-NFR-014, REQ-NFR-021, REQ-TEST-005, REQ-TEST-006]
---

# Output review requirements

The owner reviews what the model-backed steps produce (triage decisions and extraction candidates) in a small interactive tool, before the phase 4 dashboard exists ([ADR 0116](../decisions/0116-owner-review-frontend.md)). The tool is `apps/review`, one Worker with static assets, served at `review.wispel.cc` behind Cloudflare Access and reading the staging database. It is an internal tool for one reviewer; it does not replace the dashboard, accounts, or the data API of phase 4.

### REQ-REV-001: Review list

The reviewer sees the processed publications in a list they can filter.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-23 (ADR 0116)
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
- Source: owner request of 2026-11-23 (ADR 0116)
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
- Source: owner request of 2026-11-23 (ADR 0116)
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
- Source: owner request of 2026-11-23 (ADR 0116); golden-set review (ADR 0072)
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
- Source: ADR 0116; REQ-NFR-021
- Acceptance criteria:
  1. The hostname is protected by a Cloudflare Access application that allows only the owner.
  2. The Worker also verifies the Access token (`Cf-Access-Jwt-Assertion`) of every API request: an RS256 signature from the team's published keys, the audience tag, the issuer, and the expiry. A request without a valid token gets 401 and no data; while the team domain or audience is not configured, every API request is refused.
  3. A state-changing request needs a same-origin `Origin` header (REQ-NFR-014). Responses carry a Content Security Policy without inline scripts, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and a `Referrer-Policy`.
  4. The Worker has no workers.dev address and no preview URLs, and only staging has a route.
- Verification: unit test, integration test, and the hardening check

### REQ-REV-006: Daily review queue

The reviewer works through a small daily sample chosen to be informative.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-24 (ADR 0117)
- Depends on: REQ-REV-002
- Acceptance criteria:
  1. Each decision day has a sample of `review.daily_sample` publications (default 20, between 5 and 100), drawn once with a generator seeded by the day, so every reload shows the same items in the same order.
  2. Strata are filled in the order and shares of ADR 0117 (new prompt version, borderline triage within one signal of the cut, accepted with no candidates, extraction confidence below 0.5, model rejection), and random items fill the rest. Each item shows its stratum.
  3. A sample smaller than its size is topped up when the day has more decisions later; items already in it never change.
  4. The queue opens the newest decision day by default, offers the 14 most recent days, and shows how many publications have a verdict on every item.
  5. When every item of a publication has a verdict, the queue moves to the next publication that does not.
- Verification: unit test and integration test

### REQ-REV-007: Error tags

An incorrect or unsure verdict says why.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-24 (ADR 0117)
- Depends on: REQ-REV-003
- Acceptance criteria:
  1. A verdict carries tags from the list `tags-v1` of ADR 0117 for its step; a tag of the other step, or a tag on a correct verdict, is refused with a validation error.
  2. Tags are stored with the verdict, returned with the current verdict, and included in the export.
  3. The reasons can be chosen with one key each while the reason picker is open.
- Verification: unit test and integration test

### REQ-REV-008: Structured corrections and undo

The reviewer records what the right output is, and can take a verdict back.

- Phase: 2
- Priority: should
- Status: in-progress
- Source: owner request of 2026-11-24 (ADR 0117)
- Depends on: REQ-REV-003
- Acceptance criteria:
  1. A triage verdict can carry the five signals as the reviewer reads them, and the tool previews the score and decision with the pipeline's triage rule (REQ-PROC-008).
  2. A candidate verdict can carry a corrected finding, customer, evidence quote, and customer quote. When extraction read the abstract, a corrected quote that does not occur in it after normalisation (ADR 0064) is refused.
  3. Undo withdraws the current verdict of a target: the row stays, the newest verdict that is not withdrawn becomes current, and the list, queue, summary, and export reflect it. Undo with nothing left to withdraw answers not-found.
  4. `a` marks every item of a publication without a verdict correct, and `u` undoes the last verdict of the session.
- Verification: unit test and integration test

### REQ-REV-009: Quotes in full-text context

The reviewer sees full-text quotes in context.

- Phase: 2
- Priority: could
- Status: planned
- Source: review tool plan of 2026-11-24
- Depends on: REQ-REV-002
- Acceptance criteria:
  1. When extraction read the full text, each quote is shown with about 300 characters around it from the stored text, and never the whole text (ADR 0014).
  2. Each quote shows whether it was found in the abstract, in the full text, or not at all.
- Verification: integration test

### REQ-REV-010: Review insights

The reviewer sees where the model output goes wrong.

- Phase: 2
- Priority: could
- Status: planned
- Source: review tool plan of 2026-11-24
- Depends on: REQ-REV-004, REQ-REV-007
- Acceptance criteria:
  1. Agreement is shown over time per step, prompt version, and stratum.
  2. Error tags are counted per step and prompt version, with up to three example publications per tag.
- Verification: integration test

### REQ-REV-011: Golden-set drafts from reviews

Reviewed and corrected output becomes golden-set entries with little retyping.

- Phase: 2
- Priority: could
- Status: planned
- Source: review tool plan of 2026-11-24; ADR 0072
- Depends on: REQ-REV-008, REQ-TEST-005, REQ-TEST-006
- Acceptance criteria:
  1. A reviewed publication can be exported as a draft golden-set entry in the format of `agents/extraction/evals`, using the corrected values.
  2. A draft passes `scripts/check-golden-sets.py` before export, and is added only by a pull request the owner merges, so the owner confirms every label (ADR 0072).
- Verification: integration test and the golden-set check
