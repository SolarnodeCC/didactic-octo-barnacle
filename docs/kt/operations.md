---
title: Operations
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-28
related: [REQ-NFR-001, REQ-NFR-005, REQ-NFR-008, REQ-NFR-015, REQ-NFR-017, REQ-ADM-001, REQ-ADM-002, REQ-REV-005]
---

# Operations

The repository holds the KT documents, the phase 1 foundation toolchain (`packages/models`, pnpm workspace, lint, and CI), and Cloudflare infrastructure scaffolding (`infrastructure/cloudflare`: Wrangler config, D1 migrations, bootstrap planner). `apps/pipeline` also holds the source clients (retry with backoff, arXiv rate limiting), the D1 repository with deduplication, and a Worker entry that answers a health check. It also holds the cron handler that starts a run, the queue consumer for pages and dead letters, and the replay function for dead-lettered messages (REQ-DATA-009, REQ-DATA-011). It also stores license-gated PDFs in R2 through a safe fetcher (REQ-DATA-004, REQ-DATA-010). It also builds run reports, structured logs, and alerts by GitHub issue and email (REQ-NFR-008, REQ-NFR-019), and erases authors on request (REQ-NFR-016). The phase 2 build is complete in code: full text, embeddings and search, triage, extraction, retractions, recovery, the budget and the processing run report, the thin slice with one read route in `apps/api`, and the owner review tool in `apps/review` ([phase 2 build plan](phase-2/build-plan.md)). The workflows `Staging pipeline` (after a green `main`), `Staging deploy`, and `Staging measure` deploy the Worker to staging and report the measurements (ADR 0046). Ingestion runs in staging, and processing (`PROCESSING_ENABLED`) has run there since 2026-11-28; the staging days are collected in the [phase 2 exit evidence](phase-2/exit-evidence.md). The route to erase an author and the public author notice come with the admin API in phase 4; sections marked *planned* describe how they will work once those packages exist (ADR 0004 (Accepted), ADR 0020).

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
| Integration tests | `pnpm test:integration` | yes (`CI` / `toolchain`) |
| Coverage report | `pnpm test:coverage` | no, reported only (`CI` / `toolchain`) |
| Check-script tests | `pnpm check:scripts` | yes (`CI` / `toolchain`) |
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

The bootstrap script creates D1, R2, two Queues, one for pages and one for PDF downloads (ADR 0047), each with its dead-letter queue, a Vectorize index (768 dimensions, cosine, ADR 0027), and an AI Gateway through the Cloudflare API; Durable Object namespaces come from a Worker deploy (ADR 0027). The manual workflow `.github/workflows/staging-bootstrap.yml` reports drift for staging and, with `apply`, creates what is missing and then checks that nothing is still missing, using the secrets of the GitHub environment `staging`. Run it by hand with `apply`. The `fail_on_drift` input is for the automated `Staging pipeline`, which runs without `apply` and stops before the deploy when a resource is missing; with `apply` set, the run fails only if a resource is still missing after it. Vectorize creates a metadata index asynchronously, so after creating one, apply lists the index's metadata indexes every 10 seconds for up to 5 minutes until it shows up; one still missing then fails the last step. The workflow `.github/workflows/staging-database.yml` lists and applies the migrations on `roi-staging`. Migration `0001_init.sql` is frozen at the phase 1 ingestion tables; tables for later phases come in new migrations (ADR 0028). Migrations 0001 to 0016 are applied to staging.

## Deployment

Staging is deployed by `.github/workflows/staging-deploy.yml`, run from `main` only. `.github/workflows/staging-pipeline.yml` starts it automatically, as a run of its own, when `CI` and `Configuration` are green for the newest commit of `main`; the deploy first stops if a resource is missing, and the pull request approval is the gate (ADR 0046). You can also run it by hand. It builds, applies pending database migrations (unless switched off), and uploads the Worker together with its secrets in one version (`wrangler deploy --secrets-file`), so the Worker never runs without its erasure key. The workflow then lists the live deployment. Production is released weekly by `.github/workflows/production-release.yml`: a planner picks the newest commit of `main` whose changes ran on staging for the soak time (`RELEASE_SOAK_HOURS`, default 48), have no open `Depends on #N`, no `hold` label, and no drop or rename migration without `contract-ok`, and it starts `production-deploy.yml` as a run of its own, which deploys that commit and tags it `release-<date>-<sha>` (ADR 0044, ADR 0046). A run by hand is a dry run unless `dry_run` is off, and nothing deploys until the variable `PRODUCTION_AUTO_RELEASE` is `true` after the launch checklist. A failed release opens an `alert` issue, which pauses releases until it is closed. Database migrations are plain SQL files that `wrangler d1 migrations` applies before the Worker that needs them (ADR 0020, REQ-NFR-020). A rollback redeploys the previous Worker version via Wrangler rollback or re-deploy of the prior git tag; migrations are written expand/contract so the previous version still works with the new schema. Vectorize index rebuilds are a separate runbook step after a restore.

### Phase 2 processing in staging

Staging runs with `PROCESSING_ENABLED = "true"` for the seven staging days of WP11; production stays off until the phase 2 release (ADR 0118, [exit evidence](phase-2/exit-evidence.md)). Before the first deploy with processing on:

1. Run `Staging bootstrap` with `apply`, so the text, model, and embedding queues with their dead-letter queues and the Vectorize metadata indexes exist.
2. Check that the AI Gateway `roi-staging` exists and that the staging budget variables are set (`BUDGET_EXPECTED_DAILY_*`, ADR 0113).
3. Run `Staging deploy`; it applies migrations 0009 to 0015 before the Worker that needs them.
4. The next morning, after the 11:00 UTC admission run, read the daily processing run report (`processing_run.report_json`) and the alerts. Record each day in the exit evidence. A `budget-stop` or `quality-drift` alert, or a dead letter, is looked at the same day.

### Owner review tool

The owner review tool (`apps/review`, ADR 0116, REQ-REV-001 to REQ-REV-005) is deployed to staging only, at `review.wispel.cc`, by `.github/workflows/review-deploy.yml` (by hand, from `main`, environment `staging`). It reads the staging D1 database and writes only `output_review`; migration 0014 ships with the normal staging deploy, so run `Staging deploy` first. Before the first deploy, the owner:

1. Creates a self-hosted Cloudflare Access application for `review.wispel.cc` with one policy that allows only the owner's email address.
2. Sets the variables `REVIEW_ACCESS_TEAM_DOMAIN` (for example `<team>.cloudflareaccess.com`) and `REVIEW_ACCESS_AUD` (the application's audience tag) in the GitHub environment `staging`. They are not secrets. The workflow stops when either is missing and passes both to the Worker as `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`; a Worker without them refuses every API request.
3. Removes any custom domain on `wispel.cc` itself from `roi-pipeline-staging`; the pipeline Worker has no public route (REQ-NFR-021), and the bare domain is reserved for the product (ADR 0026).
4. Gives the staging `CLOUDFLARE_API_TOKEN` the permission to edit Workers routes on the `wispel.cc` zone, so the deploy can attach the custom domain.

The tool opens on **Today**: the daily queue of `review.daily_sample` publications (ADR 0124, REQ-REV-006); **Browse** is the full list. Press `?` for the keyboard shortcuts. The tool shows triage and extraction output only where processing is on (`PROCESSING_ENABLED`). Locally, `pnpm --filter @roi/review dev` builds the app, applies the migrations to the pipeline's local D1, and serves it on `wrangler dev` with a development bypass of the Access check that only the `local` environment allows; `pnpm --filter @roi/review seed:local` loads sample output (`apps/review/seed/local.sql`).

Do not use Cloudflare Workers Builds to deploy `roi-pipeline-staging` (including Preview builds with `npx wrangler preview`). That path skips migrations and the secrets-file upload. Keep Workers Builds **Preview Builds** off for that Worker; staging stays on the GitHub Actions workflow above. The Wrangler `[env.preview]` environment in `infrastructure/cloudflare/wrangler.toml` is separate and remains for on-request preview deploys when that environment exists.

Settings outside the repository cannot be checked by `scripts/check-hardening.py`. Review them every quarter and after any change of owners (REQ-NFR-021, ADR 0033). The owner last confirmed the environment branch limits, secret scanning with push protection, private vulnerability reporting, and the private repository on 2026-11-10:

| Setting | Expected |
|---|---|
| GitHub environment `staging` | No required reviewers (the pull request approval is the gate, ADR 0046); deployment limited to the `main` branch |
| GitHub environment `production` | Own protection rules (for example a required reviewer or wait timer); deployment limited to the `main` branch |
| Branch protection on `main` | Pull request required with at least one approval and code owner review; status checks `parse` and `toolchain` required; no force pushes |
| Secret scanning and push protection | On (REQ-NFR-001) |
| Private vulnerability reporting | On, so the route in `SECURITY.md` works |
| Code scanning (CodeQL default setup) | On for `actions`, `javascript-typescript`, and `python`, on pull requests and `main` |
| Dependency graph and Dependabot alerts | On, so Dependabot security updates and GitHub's dependency review action work |
| Cloudflare API token | Least permissions for the environment (see the secrets table); one token per environment (ADR 0046, ADR 0074) |
| Repository visibility | Private while alert issues are opened here: they hold run IDs, failure reasons, and host names (REQ-NFR-019). Move `ALERT_GITHUB_REPO` to a private operations repository before this one is made public |
| Workers Builds on `roi-pipeline-staging` | Preview Builds off; no automatic deploy that replaces Staging deploy |
| Authenticated Gateway on `roi-staging` and `roi-production` | On; the bootstrap drift check fails when it is off (ADR 0120), so a failed `Staging deploy` names the gateway to fix |
| Who can read `ERASURE_HASH_KEY` and the erasure list | Admins of the GitHub environments, holders of the offline copy, and Cloudflare account members with D1 read: list them and remove anyone who no longer needs it (ADR 0123) |

Set these in the GitHub environment `staging` before the first run:

| Kind | Name | Needed |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | yes |
| Secret | `ERASURE_HASH_KEY` (32 or more random characters) | yes; the workflow stops without it |
| Secret | `OPENALEX_API_KEY` | yes for full OpenAlex runs; cursor paging past the first page needs a free key (ADR 0034) |
| Secret | `ALERT_GITHUB_TOKEN`, `RESEND_API_KEY` | for alerts; without them that channel is off |
| Variable | `ALERT_EMAIL_TO` | for alert emails |
| Secret | `SCOPE_PR_TOKEN` | for the monthly `OpenAlex scope sync` (ADR 0046) |
| Variable | `PRODUCTION_AUTO_RELEASE` (repository), `RELEASE_SOAK_HOURS` (optional, default 48) | `true` switches on the weekly production deploy (ADR 0044) |

Also create the GitHub label `alert` once. The first scheduled runs start at the next 06:00 UTC (OpenAlex) and 07:30 UTC (arXiv); a run cannot be started by hand before phase 4. The manual workflow `.github/workflows/openalex-scope-lookup.yml` looks up the OpenAlex subfield IDs of the topic map and the volume per subfield with the staging `OPENALEX_API_KEY` (read-only; see [ingestion scope](data-sources/ingestion-scope.md)). After a few runs, `Staging measure` reports the volume, the data quality, and the cost estimate (ADR 0032).

## Schedules

Cron expressions (UTC) are in [defaults](architecture/defaults.md).

| Job | Schedule | Requirement |
|---|---|---|
| OpenAlex ingestion | daily 06:00 (cron in `wrangler.toml` for staging and production; the Worker is not deployed yet) | REQ-DATA-009 |
| arXiv ingestion | daily 07:30 | REQ-DATA-009 |
| Retraction check | weekly Monday 08:00 | REQ-DATA-008 |
| Retention job | daily 03:00 | REQ-NFR-015 |
| Nightly evals | daily 02:00 | REQ-TEST-004 |
| Staging scheduled checks (drift, measure) | weekly Monday 05:17 | REQ-NFR-020 |
| Production release (prefix of `main`) | weekly Tuesday 07:23 | REQ-NFR-020 |
| OpenAlex scope sync (draft PR on changed IDs) | monthly, day 1 at 05:43 | REQ-DATA-001 |

## Monitoring

- Every ingestion and pipeline run writes a run report with counts and failures (REQ-NFR-008).
- A failed scheduled run, a run that exceeds its time window, a budget stop, a dead-lettered message, or a breach of the availability target (REQ-NFR-017) raises an alert (REQ-NFR-019). An alert sends an email to the ops address and opens a GitHub issue labeled `alert`; repeats within 24 hours comment on the open issue.
- The staging and production Workers keep every log line and trace in Workers Observability, with issue detection on (REQ-NFR-008, ADR 0077).
- AI Gateway shows tokens, cost, and latency per agent (REQ-NFR-003). The Worker calls it through its Workers AI binding, which needs no gateway token; every gateway has Authenticated Gateway on (ADR 0120).
- Query strings are redacted in staging and production traces (ADR 0121); the pipeline's log lines name hosts, not URLs.

## Runbooks

Severity: **SEV1** production down or data loss risk; **SEV2** ingestion or pipeline stopped; **SEV3** single-candidate or single-user issue. Page the owner in [open questions](open-questions.md) OQ-034 (MVP: `@SolarnodeCC`). Post a short note in the ops issue; no public status page in the MVP.

| Situation | Sev | First steps |
|---|---|---|
| A source rate-limits or is down | SEV2 | Check the run report; the next run picks up failed items. Lower the request rate if limits changed. |
| A model provider is down | SEV2 | Pipeline steps retry and then fail; rerun failed candidates when the provider recovers, or switch the model in configuration through a PR. |
| The daily budget is reached | SEV2 | Check cost per opportunity in AI Gateway before raising the budget (ADR 0023). |
| Bad output reached the dashboard | SEV3 | Hide the opportunity in Operations (REQ-ADM-001), add the case to the golden set, and fix the prompt through a pull request with evals. |
| Candidates failed or are incomplete | SEV3 | Open Pipeline health and rerun them from the first failed step (REQ-ADM-002). Check the budget first. |
| PDFs of a new host are refused (`document.refused` with code `blocked-url`) | SEV3 | Staging and production fetch only allowlisted hosts (ADR 0119). Count the refusals by `host` and `refusedHost`; for a host that serves open access PDFs, add it to `apps/pipeline/src/documents/pdf-proven-hosts.json` (sorted, exact name) or a curated domain to `pdf.allowed_hosts`, through a pull request. The next run that stores the publication queues the PDF again. |
| A deploy stops on an AI Gateway with authentication off | SEV2 | Turn on Authenticated Gateway for the named gateway in the Cloudflare dashboard (AI, AI Gateway, the gateway, Settings) and rerun `Staging deploy`. The Worker's binding keeps working; HTTP clients need a gateway token (ADR 0120). |
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
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (benchmark) | Run model benchmark rounds through AI Gateway ([running a round](test/model-benchmark-run.md)); the token has Workers AI Read, and R2 Edit only when raw responses go to R2 | GitHub environment `evals` or Cursor environment secret | evals |
| `SCOPE_PR_TOKEN` | Opens the draft pull request of `OpenAlex scope sync`; fine-grained token for this repository with Contents and Pull requests write, so the CI checks run on that pull request (ADR 0046) | GitHub environment secret | staging |
| `OPENALEX_API_KEY` | OpenAlex requests by the collector (REQ-DATA-001); free key required for cursor paging (ADR 0034) | Worker secret, uploaded by `Staging deploy` from the GitHub environment secret; also Cursor environment secret for local agent work | preview, staging, production |
| `SEARCH_PROVIDER_API_KEY` | Tavily, the web search provider of Market Analysis and Competition (ADR 0126); also a network secret for `api.tavily.com` in the `evals` and agent environments (ADR 0039) | Worker secret | preview, staging, production |
| `ALERT_GITHUB_TOKEN` | Opens and comments on alert issues; a fine-grained token for this repository only, with the permission Issues: read and write and no other (REQ-NFR-019 AC5) | Cloudflare Worker secret | preview, staging, production |
| `ERASURE_HASH_KEY` | Keys the erasure list of erased authors: at least 32 random characters. Ingestion stops without it. Losing or changing it makes the list useless: keep it with the other secrets and an offline copy in the owner's password manager, and never rotate it ([privacy](architecture/privacy.md), REQ-NFR-016, ADR 0031, ADR 0074) | Cloudflare Worker secret | staging, production |
| `ALERT_EMAIL_TO` | Ops address that receives alert emails (REQ-NFR-019); kept out of the repository | Worker variable | preview, staging, production |
| `ALERT_EMAIL_FROM` | Sender of alert emails: `onboarding@resend.dev` in staging (delivers only to the Resend account owner); an address on the verified domain in production (ADR 0030) | Worker variable (`wrangler.toml`) | staging, production |
| `ALERT_GITHUB_REPO` | `owner/repo` that receives alert issues | Worker variable (`wrangler.toml`) | staging, production |
| `EVAL_ANTHROPIC_API_KEY`, `EVAL_AI_GATEWAY_TOKEN` | Live evals (REQ-TEST-004, ADR 0006); the judge is Anthropic, a different provider than the Workers AI agents (ADR 0049) | GitHub environment `evals`, with required reviewer approval | evals |

## Launch checklist (planned)

The first production launch is an invited pilot without billing (see the non-goals in the [overview](overview.md)). It needs all of these:

- Sending domain `wispel.cc` verified with SPF, DKIM, and DMARC (REQ-ACC-007, ADR 0026).
- Author erasure reachable by an admin (`POST /admin/authors/:id/erase`), `ERASURE_HASH_KEY` set, and an erasure tested on staging (REQ-NFR-016).
- Terms, privacy policy, author notice, and support contact published (REQ-ACC-011, [privacy](architecture/privacy.md)).
- Data processing agreements signed with Cloudflare, the model providers, Resend, and Tavily (ADR 0126).
- Launch questions 6 to 12 of the [legal review brief](legal/review-brief.md) are answered in writing, among them the terms for transient processing of non-redistributable full text and the storage terms of Tavily (ADR 0039).
- Retention job running (REQ-NFR-015) and a restore drill done (REQ-NFR-017).
- Calibrated daily budget set (ADR 0023), the GitHub label `alert` created, and the alert email address and GitHub issue creation tested (REQ-NFR-019).
- At least one active admin and a tested admin recovery path (REQ-ADM-001, REQ-ADM-002).
- Load test on seeded data meets REQ-NFR-017, run on staging.
- A fixed monthly model budget for the pilot is set and communicated to the pilot users.

## Branches

Open a pull request. Do not commit directly to `main`.
