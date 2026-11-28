# Bugbot review rules

Product source of truth is `docs/kt/`. Prefer findings that map to a requirement ID, ADR, or hardening rule when one applies. Report concrete defects in the diff; skip style nits that CI already covers (`pnpm lint`, `pnpm format:check`, `python3 scripts/check-*.py`).

## Secrets and license

- Report secrets, tokens, private keys, Cloudflare credentials, AI provider keys, or `.env` / `.dev.vars` / `*.pem` files committed to the repository (REQ-NFR-001).
- Report configuration that embeds a secret value instead of naming a Cursor environment secret or GitHub Actions secret.
- Report a mismatch between `LICENSE` and the License section of `README.md`. The project license is MIT. Do not suggest a second license.

## KT and architecture alignment

- Report behavior changes that do not update the affected KT document or requirement in `docs/kt/` in the same pull request.
- Report new runtime services, package manifests, Workers bindings, queues, workflows, or infrastructure that `docs/kt/architecture/` does not describe, unless the same change updates it.
- Report a new or changed requirement ID that reuses an existing `REQ-*` ID, or a deleted requirement file instead of `Status: dropped`.
- Do not request product features that `docs/kt/roadmap.md` lists only as later roadmap phases. The repository may still be specification-only for some apps.
- Do not suggest committing environment snapshots, machine-local paths, or Cursor secrets.

## Security and untrusted input

- Report publication text, abstract text, PDF content, or search-tool results used as model instructions instead of delimited untrusted data (REQ-NFR-006).
- Report agents gaining write tools, unbounded outbound tools, or a search tool that is not read-only and bounded (REQ-AGENT-013).
- Report model or source content rendered as HTML, or links that are not `https` with `rel="noopener noreferrer nofollow"` (REQ-NFR-013).
- Report state-changing API routes that skip CSRF / Origin checks, or CORS headers that allow another origin (REQ-NFR-014).
- Report role checks missing on dashboard or API routes that touch reviews, status, admin, auth, or DSAR (REQ-NFR-012).
- Report user-owned queries that omit the shared organization-ID filter (REQ-NFR-018).
- Report use of `eval`, `new Function`, shelling out on untrusted input, or dynamic code execution without a clear justified exception and tests.

## Collector, PDF, and outbound HTTP

- Report a second PDF or page downloader outside `apps/pipeline` document fetch paths (ADR 0029, REQ-DATA-010).
- Report outbound fetches without a timeout, without a response size cap, that follow redirects without re-checking the target, that accept non-`https` URLs, that allow IP literals or IP-embedding hostnames, or that retry non-idempotent requests after an unclear outcome (REQ-NFR-021).
- Report enabling `workers.dev` or preview URLs in `wrangler.toml`, or removing least-privilege Worker bindings.

## CI, workflows, and hardening

- Report GitHub Actions that are not SHA-pinned, `actions/checkout` that keeps credentials, workflows missing top-level `permissions`, use of `pull_request_target`, secrets on `pull_request`, or `run` scripts that interpolate untrusted event data or inputs (REQ-NFR-021).
- Report jobs that use a GitHub environment off `main`, pass `secrets: inherit` broadly, or put secrets in job-level `env` where install scripts can see them (ADR 0074).
- Report Dependabot or CODEOWNERS coverage gaps introduced by the change.

## Prompts, models, evals, and golden sets

- Report prompt or model changes in `packages/prompts` or agent call sites that do not touch the matching evals or golden sets when REQ-TEST-004 applies.
- Report golden-set edits that invent reviewer names other than the owner, drop verbatim extraction quotes, or bypass `scripts/check-golden-sets.py` expectations (REQ-TEST-005, REQ-TEST-006, ADR 0072).
- Report model-call logging that stores prompt text or publication text in `model_call` (privacy and ADR data model).

## Data, queues, and cost

- Report queue or alert error logging that includes raw error text, full publication bodies, or tokens (log the queue name and error class only).
- Report alert text that can notify a GitHub account via an unbroken `@name`.
- Report budget or cost accounting that attributes spend to a user instead of a pipeline run and agent (REQ-NFR-011).
- Report D1 migrations that drop or rename live columns without an expand/contract path and reviewer-approved `contract-ok` when required (REQ-NFR-020).

## Tests

- Report new behavior in `apps/`, `agents/`, `packages/`, or `infrastructure/` without tests that name the REQ-ID they verify, when an existing pattern in that package already does so (REQ-TEST-001).
- Report removal or weakening of injection fixtures, hardening checks, or audit gates without a matching KT or ADR update.
