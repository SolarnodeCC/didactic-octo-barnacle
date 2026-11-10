---
title: "0074: Environment jobs on main only, secrets per step, capped responses, and release cooldowns"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-NFR-001, REQ-NFR-021, REQ-DATA-010]
---

# 0074: Environment jobs on main only, secrets per step, capped responses, and release cooldowns

- Decision status: Accepted
- Date: 2026-11-10
- Changes: REQ-NFR-021 (criteria 8 to 11), [security](../architecture/security.md), [defaults](../architecture/defaults.md), [api routes](../architecture/api-routes.md), [privacy](../architecture/privacy.md), [operations](../operations.md)

## Context

A security audit of the repository on 2026-11-05 found the security design sound, and no secret in the git history. It found these gaps:

1. Only `Staging deploy` and `Production deploy` checked that they ran on `main`. `Staging bootstrap`, `Staging database`, `Staging measure`, `Staging scheduled checks`, and both OpenAlex scope workflows did not. They rely only on the environment's branch policy, a repository setting that no check reads. With that policy off, anyone who can push a branch could change a workflow or a CLI on it, start it by hand, and read `CLOUDFLARE_API_TOKEN`, or apply an unreviewed migration.
2. The Cloudflare credentials were set in the job-level `env`, so every step saw them, including `pnpm install`, which runs the build scripts of esbuild, workerd, and better-sqlite3. A hijacked release of a dependency would have received the token.
3. Neither Dependabot nor pnpm waited before using a new release, and Corepack fetched pnpm without checking a hash.
4. The OpenAlex and arXiv clients read whole responses with no size limit, and the arXiv parser accepted a document type declaration, through which entities can expand far beyond the downloaded size.
5. `localhost.example.org` passed the PDF URL rules, `@name` in a failure reason would notify that GitHub account from an alert issue, and Wrangler's local secrets file `.dev.vars` was not ignored by git.

## Options considered

1. **Enforce each rule in code and in `scripts/check-hardening.py`.** Chosen: a rule that is only written down gets undone (ADR 0033).
2. **Rely on repository settings (environment branch policy, required reviewers).** Kept as a second layer, but settings change without review and no check sees them.

## Decision

- Every job that uses a GitHub environment has `if: github.ref == 'refs/heads/main'` and puts no secret in its job-level `env`. The steps that call Wrangler or the infrastructure CLIs get `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in their own `env`. `scripts/check-hardening.py` fails otherwise (rules 12 and 13). The automated pipelines already start these workflows with `--ref main`.
- Dependabot waits seven days after a release (`cooldown`), pnpm resolves only versions at least three days old (`minimumReleaseAge: 4320`), and `packageManager` pins pnpm with its SHA-512 hash.
- The collector reads at most `http.max_response_bytes` (16 MiB) from one API response, checked against the declared length and while streaming. The arXiv parser refuses a document type declaration; the standard XML entities are still decoded.
- The PDF URL rules refuse any name with a `localhost` label. `sanitizeReason` breaks `@name` with a zero-width space. `.dev.vars` is ignored by git and denied to Claude Code reads.
- The planned session cookie uses the `__Host-` prefix with `Secure`, `HttpOnly`, and `SameSite=Lax`, and each AI Gateway has Authenticated Gateway turned on.

## Consequences

- A workflow with an environment can no longer be run from a branch, not even for a test. Test changes to these workflows on `main` after review, or with a dry-run input.
- A dependency fix released less than three days ago needs a deliberate exception (`minimumReleaseAgeExclude`) in the pull request that takes it.
- Follow-up work at the time: a separate read-only Cloudflare token, a dual-key transition for `ERASURE_HASH_KEY`, and a second code owner. The update below settles all three.

## Update 2026-11-10

The owner decided on the follow-up work:

- **Read-only token:** considered and dropped. One `CLOUDFLARE_API_TOKEN` per environment is kept, as in ADR 0046. The main-only guard, step-scoped secrets, and release cooldowns of this ADR already limit what a compromised dependency could reach.
- **`ERASURE_HASH_KEY`:** one key, never rotated, kept in the environment secrets and as an offline copy. A dual-key transition would protect only the entries made after a rotation, so it is not built ([privacy](../architecture/privacy.md)).
- **Second code owner:** deferred until someone joins (OQ-034). Until then a review cannot be independent of the author.
- **Repository settings:** the owner confirmed the environment branch limits, secret scanning with push protection, private vulnerability reporting, and the private repository on 2026-11-10.
