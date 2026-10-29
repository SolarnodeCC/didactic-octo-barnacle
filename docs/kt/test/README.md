---
title: Test strategy
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-TEST-001, REQ-TEST-002, REQ-TEST-003, REQ-TEST-004, REQ-TEST-005]
---

# Test strategy

## Goals

- Prove that every requirement in [requirements](../requirements/README.md) is met, with a test or a named review.
- Catch regressions in agent output, which is not deterministic, without making CI flaky.
- Keep pull request CI fast, free of secrets, and independent of external services.

## Principles

- **Requirements first.** Every test names the REQ-ID it verifies (REQ-TEST-001), for example a Vitest case named `REQ-SCORE-002: maps 69 to Medium`.
- **Deterministic where possible.** Scoring, parsing, and storage are plain code and get exact assertions. Only model output needs evals.
- **No live calls in unit, integration, and contract tests** (REQ-TEST-003). Academic APIs use recorded fixtures; model calls are stubbed. Live evals run in a separate eval job for prompt and model changes and nightly (ADR 0006).
- **Contracts before quality.** Agent output must always match its contract (REQ-TEST-002). Output quality is measured with evals against thresholds (REQ-TEST-004, REQ-TEST-005).
- **Tests live next to the code** they test, inside each app, agent, or package.

## Documents

- [Test levels](levels.md): unit, integration, contract, and end-to-end tests, and the tools for each.
- [AI evals](ai-evals.md): golden sets, scoring of model output, thresholds, and prompt regression.
- [Test data](test-data.md): fixtures, golden sets, and privacy rules.
- [CI gates](ci-gates.md): which checks block a merge in each roadmap phase.
- [Named reviews](named-reviews.md): requirements verified by a named review or CI script (REQ-TEST-001).

## Beyond functional tests

| Concern | How it is tested | Requirement |
|---|---|---|
| Prompt injection | Fixtures with instructions hidden in abstracts and full text, in contract tests | REQ-NFR-006 |
| Evidence | Quotes are checked against the input text in contract tests and evals | REQ-AGENT-008 |
| Data quality | Ingestion run reports count incomplete records, duplicates flagged for review, and failed PDFs | REQ-NFR-008 |
| Cost | Budget stop tested with a stubbed gateway; eval runs report cost | REQ-NFR-005 |
| Usage records | Model call records checked against stubbed gateway totals | REQ-NFR-011 |
| Output repair | Unit tests of the repair function and contract tests with malformed responses | REQ-AGENT-011 |
| Concurrency | A stubbed gateway records concurrent calls and checks the limit | REQ-AGENT-012 |
| Throughput | Load test on recorded fixtures with stubbed models | REQ-NFR-010 |
| Accessibility | Automated accessibility check in the end-to-end tests | REQ-DASH-006 |
| Access control | End-to-end test of unauthenticated requests | REQ-NFR-007 |
| Accounts | End-to-end tests of the invitation, create-account, settings, and sign-in flows with a stubbed Resend, including a link opened by a mail scanner; integration tests of token expiry, reuse, and rate limits | REQ-ACC-001 to REQ-ACC-011 |

## Responsibilities

| Role | Responsibility |
|---|---|
| Author of a pull request | Adds or updates tests for the requirements it touches and names the REQ-IDs in the pull request. |
| Reviewer | Checks that the named requirements are met and that the tests prove the acceptance criteria. |
| Code owner of `docs/kt` | Approves changes to requirements, eval thresholds, and golden sets. |

## Current state

`packages/models` has unit tests for phase 1 ingestion schemas and helpers. CI runs the configuration check, the KT check, and the toolchain gates including the traceability check (see [CI gates](ci-gates.md)). The test tools are decided in ADR 0008.
