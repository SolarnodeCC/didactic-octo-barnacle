---
title: Operations
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-NFR-001, REQ-NFR-005, REQ-NFR-008, REQ-NFR-015, REQ-NFR-017, REQ-ADM-001, REQ-ADM-002]
---

# Operations

The repository is specification-only. There is no deployed service, dev server, or application package yet. Sections marked *planned* describe how operations will work once code exists; they follow ADR 0004, which is still proposed.

## Checks

| Check | Command | Runs in CI |
|---|---|---|
| Configuration | `python3 scripts/check-config.py` | yes |
| KT documents | `python3 scripts/check-kt.py` | yes |
| Workspace | the `install` command in `.cursor/environment.json` | yes |

Install the Python dependency first:

```bash
python3 -m pip install -r scripts/requirements.txt
```

CI is defined in `.github/workflows/config.yml` and runs on every pull request and on pushes to `main`.

## Environments (planned)

| Environment | Purpose | Deployed from | Data |
|---|---|---|---|
| local | Development and tests | a developer's machine or a Cloud Agent | local bindings and fixtures |
| preview | Check a change before merge | a pull request branch, on request | a small fixed corpus |
| staging | Launch checklist, load test, restore drill, email checks | `main`, before production | a smaller ingestion scope, production-like volume |
| production | The running platform | `main`, after CI passes | full ingestion scope |

Each environment has its own D1 database, R2 bucket, Vectorize index, Queues with dead-letter queues, Durable Object namespace, AI Gateway, budget (REQ-NFR-005), and Cloudflare API token. A staging environment is a production-like copy: its own D1 database, R2 bucket, Vectorize index, Queues, Durable Object namespace, AI Gateway, budget, and the production Resend sending domain, fed by a smaller ingestion scope. It is deployed from `main` before production and is where the load test, the restore drill, and the email checks of the launch checklist run. Preview stays for pull requests.

## Deployment (planned)

A GitHub Actions job deploys with Wrangler after a merge to `main`. Database migrations run before the Worker that needs them. A rollback redeploys the previous version; migrations are written so the previous version still works with the new schema.

## Schedules (planned)

| Job | Schedule | Requirement |
|---|---|---|
| OpenAlex ingestion | daily | REQ-DATA-009 |
| arXiv ingestion | daily, after the arXiv announcement | REQ-DATA-009 |
| Retraction check | weekly | REQ-DATA-008 |
| Retention job | daily | REQ-NFR-015 |
| Nightly evals | nightly | REQ-TEST-004 |

## Monitoring (planned)

- Every ingestion and pipeline run writes a run report with counts and failures (REQ-NFR-008).
- A failed scheduled run, a run that exceeds its time window, a budget stop, a dead-lettered message, or a breach of the availability target (REQ-NFR-017) raises an alert (REQ-NFR-019). An alert sends an email to the ops address and opens a GitHub issue labeled `alert`; repeats within 24 hours comment on the open issue.
- AI Gateway shows tokens, cost, and latency per agent (REQ-NFR-003).

## Runbooks (planned)

| Situation | First steps |
|---|---|
| A source rate-limits or is down | Check the run report; the next run picks up failed items. Lower the request rate if limits changed. |
| A model provider is down | Pipeline steps retry and then fail; rerun failed candidates when the provider recovers, or switch the model in configuration. |
| The daily budget is reached | Check cost per opportunity in AI Gateway before raising the budget. |
| Bad output reached the dashboard | Hide the opportunity in Operations (REQ-ADM-001), add the case to the golden set, and fix the prompt through a pull request with evals. |
| Candidates failed or are incomplete | Open Pipeline health and rerun them from the first failed step (REQ-ADM-002). Check the budget first. |
| A message is dead-lettered | Inspect the message, fix the cause, and replay it (REQ-DATA-011). |
| An author asks for erasure | Follow the erasure process in [privacy](architecture/privacy.md) (REQ-NFR-016). |

## Backup and recovery (planned)

D1 Time Travel restores the database to an earlier point. Targets are a recovery point of 24 hours and a recovery time of 4 hours, tested once with a restore drill before launch (REQ-NFR-017). After a restore, apply the list of erasures made since the restore point (REQ-NFR-015). R2 objects can be rebuilt from the sources. Vectors can be rebuilt from stored publications (REQ-PROC-001).

## Secrets

Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab or in GitHub Actions secrets. Never commit them. When a secret is introduced, add its name and purpose to the table below, not its value.

| Secret name | Purpose | Stored in | Environments |
|---|---|---|---|
| `RESEND_API_KEY` | Sends invitation and sign-in emails (REQ-ACC-007) | Cloudflare Worker secret; GitHub Actions secret for deployment | preview, production |
| `ALERT_GITHUB_TOKEN` | Opens and comments on alert issues; a fine-grained token limited to issues on this repository (REQ-NFR-019) | Cloudflare Worker secret | preview, staging, production |
| `ALERT_EMAIL_TO` | Ops address that receives alert emails (REQ-NFR-019) | Worker variable | preview, staging, production |
| Eval provider and AI Gateway credentials (names set when the eval job is added) | Live evals (REQ-TEST-004, ADR 0006) | GitHub environment `evals`, with required reviewer approval | evals |

## Launch checklist (planned)

The first production launch is an invited pilot without billing (see the non-goals in the [overview](overview.md)). It needs all of these:

- Sending domain verified with SPF, DKIM, and DMARC (REQ-ACC-007).
- Terms, privacy policy, author notice, and support contact published (REQ-ACC-011, [privacy](architecture/privacy.md)).
- Data processing agreements signed with Cloudflare, the model providers, Resend, and the search provider.
- Retention job running (REQ-NFR-015) and a restore drill done (REQ-NFR-017).
- Calibrated daily budget set (OQ-021) and the alert email address and GitHub issue creation tested (REQ-NFR-019).
- At least one active admin and a tested admin recovery path (REQ-ADM-001, REQ-ADM-002).
- Load test on seeded data meets REQ-NFR-017, run on staging.
- A fixed monthly model budget for the pilot is set and communicated to the pilot users.

## Branches

Open a pull request. Do not commit directly to `main`.
