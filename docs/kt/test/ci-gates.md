---
title: CI gates
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-TEST-001, REQ-TEST-002, REQ-TEST-003, REQ-TEST-004]
---

# CI gates

A gate blocks a merge when it fails. Gates add up: each phase keeps the gates of the phases before it.

| Phase | Gates added |
|---|---|
| Now (specification only) | Configuration check, KT check, workspace install |
| 1 | Lint (ESLint), format check (Prettier), typecheck, build, unit tests, integration tests, traceability check (REQ-TEST-001), dependency review |
| 2 | Contract tests (REQ-TEST-002) |
| 3 | Evals on prompt and model changes (REQ-TEST-004) |
| 4 | End-to-end tests for the dashboard, including the accessibility check |

The nightly eval run reports but never blocks. GitHub secret scanning with push protection runs outside CI (REQ-NFR-001).

When a gate is added, record the name of its status check here and add it to the required checks of the `main` branch protection.

| Status check | Gate |
|---|---|
| `parse` | Configuration check, KT check, workspace install |
| `toolchain` | Lint, format check, typecheck, build, unit tests, traceability (REQ-TEST-001) |

Integration tests and dependency review are added with the first Worker package and stay listed above until then.

## Current CI

`.github/workflows/config.yml` runs on every pull request and on pushes to `main`:

```bash
python3 scripts/check-config.py
python3 scripts/check-kt.py
```

It also runs the `install` command from `.cursor/environment.json` twice to prove it is idempotent.

`.github/workflows/ci.yml` runs the phase 1 toolchain gates:

```bash
pnpm lint
pnpm format:check
pnpm build
pnpm typecheck
pnpm test:unit
pnpm check:traceability
```

`pnpm typecheck` builds `@roi/models` first so workspace packages can resolve its declaration files.

The collector integration tests in `apps/pipeline` run in `pnpm test:unit`. They apply the real migrations from `infrastructure/cloudflare/migrations` to an in-memory SQLite database that stands in for D1, and use recorded fixtures and stubbed `fetch` functions (REQ-TEST-003). The queue tests add an in-memory queue with at-least-once delivery, retries, and a dead-letter queue (`apps/pipeline/src/test/fake-queue.ts`); they deliver every message twice and replay a dead-lettered message (REQ-DATA-011). PDF tests use an in-memory R2 bucket and a stubbed fetch; the fetcher's URL rules, redirects, limits, and timeout are unit-tested (REQ-DATA-010). Alert tests use an in-memory GitHub and Resend; they check the issue, the email, the 24-hour comment, channel failures, and that no content or credential leaves the pipeline (REQ-NFR-019). The erasure tests search every table and the bucket for the erased name, ORCID, and affiliation, restore the database to an earlier state, and fail when a new person-related column appears (REQ-NFR-016, REQ-NFR-009). The measurement queries are tested against a database with the real migrations and hand-calculated expectations, and each must be a single read-only SELECT (REQ-NFR-005).

## Rules

- Never skip, disable, or quarantine a failing test to get a green build. Fix the test or the code, or change the requirement through a reviewed pull request.
- A flaky test is a defect. Make it deterministic.
- Jobs for lint, build, unit, integration, contract, and end-to-end tests need no secrets (REQ-TEST-003).
- Only the eval job uses secrets, from the `evals` GitHub environment, and only for branches in this repository (ADR 0006).
