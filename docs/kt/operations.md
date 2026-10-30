---
title: Operations
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-001, REQ-NFR-005, REQ-NFR-008, REQ-NFR-015, REQ-NFR-017, REQ-ADM-001, REQ-ADM-002]
---

# Operations

The repository holds the KT documents, the phase 1 foundation toolchain (`packages/models`, pnpm workspace, lint, and CI), and Cloudflare infrastructure scaffolding (`infrastructure/cloudflare`: Wrangler config, D1 migrations, bootstrap planner). `apps/pipeline` also holds the source clients (retry with backoff, arXiv rate limiting), the D1 repository with deduplication, and a Worker entry that answers a health check. It also holds the cron handler that starts a run, the queue consumer for pages and dead letters, and the replay function for dead-lettered messages (REQ-DATA-009, REQ-DATA-011). It also stores license-gated PDFs in R2 through a safe fetcher (REQ-DATA-004, REQ-DATA-010). Run reports, alerts, and the live Worker deploy are still planned; sections marked *planned* describe how they will work once those packages exist (ADR 0004 (Accepted), ADR 0020).

## Checks

| Check | Command | Runs in CI |
|---|---|---|
| Configuration | `python3 scripts/check-config.py` | yes (`Configuration` / `parse`) |
| KT documents | `python3 scripts/check-kt.py` | yes (`Configuration` / `parse`) |
| Workspace | the `install` command in `.cursor/environment.json` | yes (`Configuration` / `parse`) |
| Lint | `pnpm lint` | yes (`CI` / `toolchain`) |
| Format | `pnpm format:check` | yes (`CI` / `toolchain`) |
| Typecheck | `pnpm typecheck` | yes (`CI` / `toolchain`) |
| Build | `pnpm build` | yes (`CI` / `toolchain`) |
| Unit tests | `pnpm test:unit` | yes (`CI` / `toolchain`) |
| Traceability | `pnpm check:traceability` | yes (`CI` / `toolchain`) |

Install the Python dependency first, then the Node workspace (Node 24, ADR 0008):

```bash
python3 -m pip install -r scripts/requirements.txt
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install --frozen-lockfile
```

CI is defined in `.github/workflows/config.yml` and `.github/workflows/ci.yml` and runs on every pull request and on pushes to `main`.

## Environments (planned)

| Environment | Purpose | Deployed from | Data |
|---|---|---|---|
| local | Development and tests | a developer's machine or a Cloud Agent | local bindings and fixtures |
| preview | Check a change before merge | a pull request branch, on request | a small fixed corpus |
| staging | Launch checklist, load test, restore drill, email checks | `main`, before production | a smaller ingestion scope, production-like volume |
| production | The running platform | `main`, after CI passes | full ingestion scope |

The bootstrap planner in `infrastructure/cloudflare` (`pnpm --filter @roi/cloudflare-infra bootstrap -- --env <name>`) lists the D1, R2, Queues with dead-letter queues, Vectorize, and AI Gateway for an environment and reports drift (REQ-NFR-020, ADR 0027). `--apply` creates missing resources when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set; running it twice creates nothing. Each environment has its own resources, budget (REQ-NFR-005), and Cloudflare API token. A staging environment is a production-like copy: its own D1 database, R2 bucket, Vectorize index, Queues, AI Gateway, Durable Object namespace (created by the Worker deploy), budget, and the production Resend sending domain, fed by a smaller ingestion scope. It is deployed from `main` before production and is where the load test, the restore drill, and the email checks of the launch checklist run. Preview stays for pull requests. Wrangler configuration and numbered SQL migrations live under `infrastructure/cloudflare`.

The bootstrap script creates D1, R2, a Queue and its dead-letter queue, a Vectorize index (768 dimensions, cosine, ADR 0027), and an AI Gateway through the Cloudflare API; Durable Object namespaces come from a Worker deploy (ADR 0027). The manual workflow `.github/workflows/staging-bootstrap.yml` reports drift for staging and, with `apply`, creates what is missing, using the secrets of the GitHub environment `staging`. The workflow `.github/workflows/staging-database.yml` lists and applies the migrations on `roi-staging`. Migration `0001_init.sql` is frozen at the phase 1 ingestion tables; tables for later phases come in new migrations (ADR 0028), so migrations 0001 to 0004 can be applied to staging.

## Deployment (planned)

A GitHub Actions job deploys with Wrangler after a merge to `main`. Database migrations are plain SQL files that `wrangler d1 migrations` applies before the Worker that needs them (ADR 0020, REQ-NFR-020). A rollback redeploys the previous Worker version via Wrangler rollback or re-deploy of the prior git tag; migrations are written expand/contract so the previous version still works with the new schema. Vectorize index rebuilds are a separate runbook step after a restore. Staging is promoted to production only after the launch checklist items for that release pass on staging.

## Schedules

Cron expressions (UTC) are in [defaults](architecture/defaults.md).

| Job | Schedule | Requirement |
|---|---|---|
| OpenAlex ingestion | daily 06:00 (cron in `wrangler.toml` for staging and production; the Worker is not deployed yet) | REQ-DATA-009 |
| arXiv ingestion | daily 07:30 | REQ-DATA-009 |
| Retraction check | weekly Monday 08:00 | REQ-DATA-008 |
| Retention job | daily 03:00 | REQ-NFR-015 |
| Nightly evals | daily 02:00 | REQ-TEST-004 |

## Monitoring

- Every ingestion and pipeline run writes a run report with counts and failures (REQ-NFR-008).
- A failed scheduled run, a run that exceeds its time window, a budget stop, a dead-lettered message, or a breach of the availability target (REQ-NFR-017) raises an alert (REQ-NFR-019). An alert sends an email to the ops address and opens a GitHub issue labeled `alert`; repeats within 24 hours comment on the open issue.
- AI Gateway shows tokens, cost, and latency per agent (REQ-NFR-003).

## Runbooks

Severity: **SEV1** production down or data loss risk; **SEV2** ingestion or pipeline stopped; **SEV3** single-candidate or single-user issue. Page the owner in [open questions](open-questions.md) OQ-034 (MVP: `@SolarnodeCC`). Post a short note in the ops issue; no public status page in the MVP.

| Situation | Sev | First steps |
|---|---|---|
| A source rate-limits or is down | SEV2 | Check the run report; the next run picks up failed items. Lower the request rate if limits changed. |
| A model provider is down | SEV2 | Pipeline steps retry and then fail; rerun failed candidates when the provider recovers, or switch the model in configuration through a PR. |
| The daily budget is reached | SEV2 | Check cost per opportunity in AI Gateway before raising the budget (ADR 0023). |
| Bad output reached the dashboard | SEV3 | Hide the opportunity in Operations (REQ-ADM-001), add the case to the golden set, and fix the prompt through a pull request with evals. |
| Candidates failed or are incomplete | SEV3 | Open Pipeline health and rerun them from the first failed step (REQ-ADM-002). Check the budget first. |
| A message is dead-lettered | SEV3 | An alert names the message and its run. Inspect `payload_json` and `last_error` in `queue_message_log`, fix the cause, and replay it with `replayDeadLetter` (REQ-DATA-011; the route `POST /admin/queue/replay` comes with the admin API in phase 4). |
| An author asks for erasure | SEV3 | Follow the erasure process in [privacy](architecture/privacy.md) (REQ-NFR-016): find the author records, erase each with `eraseAuthor`, and answer within one month. The route `POST /admin/authors/:id/erase` comes with the admin API in phase 4. |
| Availability below 99.5% (REQ-NFR-017) | SEV1 | Check Workers/D1 status, last deploy, and error rate; roll back Worker if the last deploy correlates; open a SEV1 issue. |
| Need to restore D1 | SEV1 | Time Travel to the restore point; apply erasure list since that point; rebuild vectors from publications; verify with a smoke list/detail request. |

## Backup and recovery (planned)

D1 Time Travel restores the database to an earlier point. Targets are a recovery point of 24 hours and a recovery time of 4 hours, tested once with a restore drill before launch (REQ-NFR-017). After a restore, apply the list of erasures made since the restore point (REQ-NFR-015). R2 objects can be rebuilt from the sources. Vectors can be rebuilt from stored publications (REQ-PROC-001).

## Secrets

Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab or in GitHub Actions secrets. Never commit them. When a secret is introduced, add its name and purpose to the table below, not its value.

| Secret name | Purpose | Stored in | Environments |
|---|---|---|---|
| `RESEND_API_KEY` | Sends invitation and sign-in emails (REQ-ACC-007) and alert emails (REQ-NFR-019) | Cloudflare Worker secret; GitHub Actions secret for deployment | preview, staging, production |
| `RESEND_WEBHOOK_SECRET` | Verifies Resend bounce and complaint webhooks (REQ-ACC-007) | Worker secret | preview, staging, production |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deploy with Wrangler and run the bootstrap script; the token has the least permissions each environment needs | GitHub Actions secret | preview, staging, production |
| `OPENALEX_API_KEY` | OpenAlex requests by the collector (REQ-DATA-001) | Worker secret; GitHub Actions secret for tests that need it | preview, staging, production |
| `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_API_TOKEN` | Route model calls through AI Gateway (REQ-NFR-003) | Worker secret | preview, staging, production |
| `OPENAI_API_KEY` | Model provider behind AI Gateway (when OpenAI is configured) | AI Gateway / Worker secret | preview, staging, production |
| `ANTHROPIC_API_KEY` | Model provider behind AI Gateway (when Anthropic is configured) | AI Gateway / Worker secret | preview, staging, production |
| `SEARCH_PROVIDER_API_KEY` | Primary web search provider for Market Analysis and Competition (ADR 0022) | Worker secret | preview, staging, production |
| `SEARCH_PROVIDER_FALLBACK_API_KEY` | Second search provider for benchmark and failover (ADR 0022) | Worker secret | preview, staging, production |
| `ALERT_GITHUB_TOKEN` | Opens and comments on alert issues; a fine-grained token for this repository only, with the permission Issues: read and write and no other (REQ-NFR-019 AC5) | Cloudflare Worker secret | preview, staging, production |
| `ERASURE_HASH_KEY` | Keys the erasure list of erased authors: at least 32 random characters. Ingestion stops without it. Losing or changing it makes the list useless, so keep it with the other secrets (REQ-NFR-016, ADR 0031) | Cloudflare Worker secret | staging, production |
| `ALERT_EMAIL_TO` | Ops address that receives alert emails (REQ-NFR-019); kept out of the repository | Worker variable | preview, staging, production |
| `ALERT_EMAIL_FROM` | Sender of alert emails: `onboarding@resend.dev` in staging (delivers only to the Resend account owner); an address on the verified domain in production (ADR 0030) | Worker variable (`wrangler.toml`) | staging, production |
| `ALERT_GITHUB_REPO` | `owner/repo` that receives alert issues | Worker variable (`wrangler.toml`) | staging, production |
| `EVAL_OPENAI_API_KEY`, `EVAL_ANTHROPIC_API_KEY`, `EVAL_AI_GATEWAY_TOKEN` | Live evals (REQ-TEST-004, ADR 0006); judge uses a different provider than the agent | GitHub environment `evals`, with required reviewer approval | evals |

## Launch checklist (planned)

The first production launch is an invited pilot without billing (see the non-goals in the [overview](overview.md)). It needs all of these:

- Sending domain `wispel.cc` verified with SPF, DKIM, and DMARC (REQ-ACC-007, ADR 0026).
- Author erasure reachable by an admin (`POST /admin/authors/:id/erase`), `ERASURE_HASH_KEY` set, and an erasure tested on staging (REQ-NFR-016).
- Terms, privacy policy, author notice, and support contact published (REQ-ACC-011, [privacy](architecture/privacy.md)).
- Data processing agreements signed with Cloudflare, the model providers, Resend, and the search provider.
- Retention job running (REQ-NFR-015) and a restore drill done (REQ-NFR-017).
- Calibrated daily budget set (ADR 0023), the GitHub label `alert` created, and the alert email address and GitHub issue creation tested (REQ-NFR-019).
- At least one active admin and a tested admin recovery path (REQ-ADM-001, REQ-ADM-002).
- Load test on seeded data meets REQ-NFR-017, run on staging.
- A fixed monthly model budget for the pilot is set and communicated to the pilot users.

## Branches

Open a pull request. Do not commit directly to `main`.
