---
title: "0006: Run live evals only for pull requests from this repository"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-003, REQ-TEST-004]
---

# 0006: Run live evals only for pull requests from this repository

- Decision status: Proposed
- Date: 2026-10-28

## Context

REQ-TEST-004 requires evals to block a pull request that changes prompts or models. Evals call live models and need provider credentials. The test strategy also says that pull request CI needs no secrets and that live evals run only nightly. Both cannot hold at once.

## Options considered

1. **Nightly evals only.** No secrets in pull requests, but a prompt regression is found after the merge.
2. **Live evals on every pull request.** Catches regressions, but exposes secrets to code from forks.
3. **Live evals in a separate job, only for branches in this repository, with a protected GitHub environment.** Catches regressions before merge; fork code never sees secrets.

## Decision

Option 3, if accepted:

- Unit, integration, and contract tests never need secrets (REQ-TEST-003).
- A separate eval job runs on pull requests that change `packages/prompts`, model configuration, or an agent, only when the pull request branch is in this repository.
- The job uses a GitHub environment named `evals` that holds the provider and AI Gateway secrets.
- For a pull request from a fork, a maintainer pushes the change to a branch in this repository to run the evals before merging.
- The nightly eval run stays and reports without blocking.

## Consequences

- REQ-TEST-003 and REQ-TEST-004 are worded to match this decision.
- The secret names used by the `evals` environment are listed in [operations](../operations.md).
- Eval cost per pull request is reported, as for nightly runs.
