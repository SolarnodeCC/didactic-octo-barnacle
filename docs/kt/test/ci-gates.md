---
title: CI gates
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# CI gates

A gate blocks a merge when it fails. Gates add up: each phase keeps the gates of the phases before it.

| Phase | Gates added |
|---|---|
| Now (specification only) | Configuration check, KT check, workspace install |
| 1 | Unit tests, integration tests, traceability check (REQ-TEST-001) |
| 2 | Contract tests (REQ-TEST-002) |
| 3 | Evals on prompt and model changes (REQ-TEST-004) |
| 4 | End-to-end tests for the dashboard |

The nightly eval run reports but never blocks.

## Current CI

`.github/workflows/config.yml` runs on every pull request and on pushes to `main`:

```bash
python3 scripts/check-config.py
python3 scripts/check-kt.py
```

It also runs the `install` command from `.cursor/environment.json` twice to prove it is idempotent.

## Rules

- Never skip, disable, or quarantine a failing test to get a green build. Fix the test or the code, or change the requirement through a reviewed pull request.
- A flaky test is a defect. Make it deterministic.
- Pull request CI must not need secrets. Jobs that need secrets run only on trusted branches.
