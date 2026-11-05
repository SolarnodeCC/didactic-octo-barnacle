---
title: "0044: Weekly production release"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-05
related: [REQ-NFR-002, REQ-NFR-020, REQ-NFR-021]
---

# 0044: Weekly production release

- Decision status: Accepted
- Date: 2026-11-05

## Context

Staging follows `main` automatically (ADR 0043). Production should get changes once a week, and a change that depends on another pull request must not reach production without it.

## Options considered

1. **Deploy production on every merge.** No soak time on staging and no control over dependent pull requests.
2. **Release a hand-picked set of pull requests (cherry-picks).** Builds a commit that was never tested on staging.
3. **Release a prefix of `main`.** `main` is linear, so a release is everything up to one commit, and that exact commit has run on staging.

## Decision

Option 3. `Production release` runs weekly (Tuesday 07:23 UTC) and by hand. A planner (`infrastructure/cloudflare/src/release/plan.ts`) takes the commits since the last tag `release-*` and chooses the newest commit for which every change before it:

1. has green `parse` and `toolchain` checks,
2. was deployed to staging at least `RELEASE_SOAK_HOURS` hours ago (default 48) by `Staging pipeline` or `Staging deploy`,
3. has no unmet dependency: `Depends on #N` in the pull request body or a label `depends-on:N` names a pull request that is still open or comes later on `main`,
4. has no label `hold`,
5. has no migration that drops or renames something unless it carries the label `contract-ok` (set by a reviewer when no released code uses it; REQ-NFR-020 expand/contract).

The first change that fails a rule ends the release; it and everything after it wait for the next week. No open issue labeled `alert` may exist. The planner prints what ships and what waits, and why.

`Production deploy` deploys that exact commit to the environment `production`, which keeps its own protection rules. Nothing deploys until the repository variable `PRODUCTION_AUTO_RELEASE` is `true`, which the owner sets after the launch checklist. After a successful deploy the commit is tagged `release-<date>-<sha>`; the tag is the base of the next release and the rollback target.

## Consequences

- A held-back pull request also holds back every later pull request, which is the price of never shipping an untested combination. Remove the label or merge the dependency to release them.
- Only explicit dependencies are seen. Everything merged earlier on `main` always ships first.
- A failed release opens an `alert` issue, which stops the next release until someone closes it.
