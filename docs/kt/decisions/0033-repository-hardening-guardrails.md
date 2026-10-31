---
title: "0033: Repository hardening is enforced by a CI check"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-31
related: [REQ-NFR-021, REQ-NFR-001, REQ-DATA-010, REQ-NFR-019]
---

# 0033: Repository hardening is enforced by a CI check

- Decision status: Accepted
- Date: 2026-10-31

## Context

A code review of the phase 1 foundation found hardening gaps that the KT documents already promised, such as Dependabot and a dependency gate in [security](../architecture/security.md), or that were missing: no npm updates, vulnerable dev dependencies, checkouts that kept the token, a deploy that did not look at CI, unbounded outbound requests, and a public `workers.dev` address. Fixing them once does not keep them fixed: a later pull request can undo a setting without anyone noticing.

## Options considered

1. **Fix once and document.** No new code. Nothing stops a regression.
2. **Reviewer checklist.** Relies on memory and attention in every review.
3. **A script in CI that checks each rule** (`scripts/check-hardening.py`), plus `pnpm audit:ci` for dependencies. A regression fails the pull request with a message that names the rule.

## Decision

Option 3. The rules are listed in REQ-NFR-021 and in the docstring of the script. The script runs in the `Configuration` workflow (`parse` check). `pnpm audit:ci` runs in `ci.yml` (`toolchain` check) and blocks any advisory in production dependencies and any high or critical advisory in development dependencies.

The PDF fetcher keeps ADR 0029: any public host is allowed when `pdf.allowed_hosts` is empty. Names that embed an IP address and public wildcard-DNS services are refused as well, because the Worker cannot resolve DNS to see where a name points.

Retries stay on by default. A request that is not idempotent (GitHub issues and comments) is retried only after a 429, so a 5xx or timeout cannot create a duplicate; the alert sink already tries again at the next alert when no channel delivered. Resend gets an idempotency key, so its retries are safe.

## Consequences

- A new advisory can fail an unrelated pull request. The fix is to update the dependency; Dependabot opens that pull request weekly. The one moderate advisory that remains (`minimatch` under ESLint, development only, no patched version for the ESLint line in use) is below the blocking level and is reviewed when ESLint moves to a version that ships `minimatch` 11.
- GitHub's dependency review action needs the dependency graph, a repository setting. Until it is on, `pnpm audit:ci` and Dependabot cover the gate that [CI gates](../test/ci-gates.md) lists.
- Settings outside the repository cannot be checked by the script: required reviewers on the GitHub environment `staging`, required status checks on `main`, secret scanning with push protection. [Operations](../operations.md) lists them for review each quarter.
- Adding a rule means adding a check to the script and a line to REQ-NFR-021.
