---
title: "0043: Automated staging pipeline and scope sync"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-05
related: [REQ-NFR-002, REQ-NFR-020, REQ-NFR-021, REQ-DATA-001]
---

# 0043: Automated staging pipeline and scope sync

- Decision status: Accepted
- Date: 2026-11-05
- Supersedes: the "manual workflow" wording for staging in ADR 0020 (the rest of ADR 0020 stands)

## Context

The workflows `Staging bootstrap`, `Staging database`, `Staging deploy`, `Staging measure`, and `OpenAlex scope lookup` were started by hand. A merge to `main` did not reach staging, drift and pending migrations were not watched, and the OpenAlex subfield IDs were only checked when someone remembered.

## Options considered

1. **Stay manual.** Safe, but staging lags behind `main` and nothing watches drift.
2. **Deploy on every push, without approval.** Fast, but removes the reviewer gate of the `staging` environment (REQ-NFR-021, ADR 0033).
3. **Chain after green checks, keep the approval gate; read-only checks on a schedule under a second environment.**

## Decision

Option 3.

- `Staging pipeline` starts when `CI` or `Configuration` finishes on a push to `main`. A gate job lets one run continue when `parse` and `toolchain` are green for the newest commit of `main`. The pipeline reports drift, fails on missing resources (`--fail-on-drift`), then calls `Staging deploy`, which applies migrations and uploads the Worker. Bootstrap `apply` stays manual.
- The existing workflows can be called (`workflow_call`) and keep `workflow_dispatch`.
- `Staging scheduled checks` run weekly and are read-only (drift, measure). A failure opens or updates a GitHub issue labeled `alert`. They use the GitHub environment `staging-readonly`, which has no required reviewers and holds only read-only credentials, so a schedule does not wait for an approval.
- `OpenAlex scope sync` runs monthly. When the ID of a name already in the topic map changed, it opens a **draft** pull request that only changes that ID. It never adds or removes a name and ignores volumes (ADR 0038, ADR 0041). A pull request made with `GITHUB_TOKEN` does not start CI, so the workflow uses the secret `SCOPE_PR_TOKEN`, a fine-grained token for this repository with Contents and Pull requests write.
- `scripts/check-hardening.py` requires `branches: [main]` on `workflow_run` and forbids `secrets: inherit`.

## Consequences

- The owner creates the environment `staging-readonly` (branch limit `main`, no reviewers) with read-only `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `OPENALEX_API_KEY`, and adds `SCOPE_PR_TOKEN`. Names only are documented in [operations](../operations.md).
- Every rollout still needs the approval of the `staging` environment, once for the bootstrap job and once for the deploy job.
- Production keeps its own workflow after the launch checklist.
