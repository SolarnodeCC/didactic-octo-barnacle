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

## Rules

- Never skip, disable, or quarantine a failing test to get a green build. Fix the test or the code, or change the requirement through a reviewed pull request.
- A flaky test is a defect. Make it deterministic.
- Jobs for lint, build, unit, integration, contract, and end-to-end tests need no secrets (REQ-TEST-003).
- Only the eval job uses secrets, from the `evals` GitHub environment, and only for branches in this repository (ADR 0006).
