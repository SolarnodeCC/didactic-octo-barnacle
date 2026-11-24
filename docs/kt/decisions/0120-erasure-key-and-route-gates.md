---
title: "0120: Gates for the erasure-list key and for routes before authentication"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-016, REQ-NFR-007, REQ-NFR-021]
---

# 0120: Gates for the erasure-list key and for routes before authentication

- Decision status: Accepted
- Date: 2026-11-24
- Changes: REQ-NFR-021 (criterion 12), REQ-NFR-007 (criterion 4), `scripts/check-hardening.py` (rules 14 and 15), [security](../architecture/security.md#before-the-first-authentication-pull-request-merges), [privacy](../architecture/privacy.md), [operations](../operations.md)

## Context

The security review of 2026-11-23 raised three medium issues that ADR 0074 had accepted as owner decisions:

- Issue 180: `ERASURE_HASH_KEY` is never rotated, so a leak of the key together with the erasure list would show who asked to be erased. The review asked to keep access to the key minimal and audited.
- Issue 181: every path has one code owner, who is also the author, so no review is independent (OQ-034).
- Issue 182: phase 4 builds sign-in, sessions, and CSRF without a library (ADR 0011), and ADR 0058 allows an unauthenticated read route in local and preview. The review asked for a release gate so no unauthenticated route reaches staging or production, and for a dedicated security review of the first authentication pull request.

## Options considered

1. **Enforce the parts that code can check, in `scripts/check-hardening.py`, and keep the owner decisions of ADR 0074.**
2. **Rotate the key with a dual-key scheme.** Declined in ADR 0074: it protects only entries made after a rotation.
3. **Add a second code owner.** Not possible until a second person joins (OQ-034).

## Decision

Option 1.

- Rule 14: only `staging-deploy.yml` and `production-deploy.yml` may read `ERASURE_HASH_KEY`. Rule 13 already keeps it in step-level `env`.
- Rule 15: no Worker configuration (`infrastructure/cloudflare/wrangler.toml`, `apps/*/wrangler.toml`) has `route` or `routes` at the top level or in any environment other than `local` and `preview`. With `workers_dev` and preview URLs off (rule 8), no Worker is reachable from the internet in staging or production.
- The first authentication pull request lifts rule 15 only for routes behind authentication. `scripts/**` has a code owner, and the pull request is held to the checklist in [security](../architecture/security.md#before-the-first-authentication-pull-request-merges).
- Who can read the key or the erasure list is part of the quarterly access review in [operations](../operations.md#secrets).

## Consequences

- Issues 180 and 182 are closed by enforced checks; the residual risk of a leaked key stays as ADR 0074 accepted it.
- Issue 181 stays an accepted risk until a second reviewer joins (OQ-034). Rules 14 and 15 add to the compensating controls: CI gates with `check-hardening`, CodeQL, environment branch limits, and the soak time of the weekly production release.
