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
- Supersedes: the "manual workflow" wording for staging in ADR 0020 and the "required reviewers" setting for `staging` in ADR 0033 (the rest of both stands)

## Context

The workflows `Staging bootstrap`, `Staging database`, `Staging deploy`, `Staging measure`, and `OpenAlex scope lookup` were started by hand. A merge to `main` did not reach staging, drift was not watched, and the OpenAlex subfield IDs were only checked when someone remembered. The GitHub environment `staging` asked reviewers to approve each job, which would also block every scheduled job.

## Options considered

1. **Stay manual.** Safe, but staging lags behind `main` and nothing watches drift.
2. **Keep required reviewers on `staging` and add a second environment for scheduled jobs.** Two sets of secrets and two approvals per rollout, for code that a reviewer already approved.
3. **One environment `staging` without required reviewers.** The approval moves to the pull request.

## Decision

Option 3. The gate for staging is the pull request: branch protection on `main` requires an approval and a code owner review (`CODEOWNERS`), and the checks `parse` and `toolchain` must pass. The environment `staging` only limits deployment to the branch `main`. Production keeps its own protection and is released weekly (ADR 0044).

- `Staging pipeline` starts when `CI` or `Configuration` finishes on a push to `main`. A gate job lets one run continue when `parse` and `toolchain` are green for the newest commit of `main`. The pipeline reports drift, fails on missing resources (`--fail-on-drift`), then calls `Staging deploy`, which applies migrations and uploads the Worker. Bootstrap `apply` stays manual.
- The existing workflows can be called (`workflow_call`) and keep `workflow_dispatch`.
- `Staging scheduled checks` run weekly and are read-only (drift, measure). A failure opens or updates a GitHub issue labeled `alert`.
- `OpenAlex scope sync` runs monthly. When the ID of a name already in the topic map changed, it opens a **draft** pull request that only changes that ID. It never adds or removes a name and ignores volumes (ADR 0038, ADR 0041). A pull request made with `GITHUB_TOKEN` does not start CI, so the workflow uses the secret `SCOPE_PR_TOKEN`, a fine-grained token for this repository with Contents and Pull requests write.
- `scripts/check-hardening.py` requires `branches: [main]` on `workflow_run` and forbids `secrets: inherit`.

## Consequences

- Scheduled jobs use the same Cloudflare token as the deploy; there is no read-only token. Workflow files run from `main` only and sit under `CODEOWNERS`, so a change to them is reviewed.
- The owner turns off required reviewers on the environment `staging`, keeps the branch limit `main`, adds `SCOPE_PR_TOKEN`, and checks that branch protection on `main` requires an approval. Names only are documented in [operations](../operations.md).
