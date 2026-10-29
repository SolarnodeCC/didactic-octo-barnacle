---
title: Security and data protection
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-ACC-001, REQ-ACC-004, REQ-NFR-001, REQ-NFR-006, REQ-NFR-007, REQ-NFR-009, REQ-NFR-011, REQ-NFR-012, REQ-NFR-013, REQ-NFR-014, REQ-NFR-015, REQ-NFR-016, REQ-DATA-010, REQ-AGENT-013]
---

# Security and data protection

## Threats and controls

| Threat | Control | Requirement |
|---|---|---|
| Instructions hidden in a paper or search result steer an agent (prompt injection) | Paper text and search results are delimited data; agents have no write tools; the search tool is bounded and read-only; output is validated against the contract; injection fixtures in tests | REQ-NFR-006, REQ-AGENT-013 |
| Model output runs script or links to a hostile site in the dashboard | Plain-text rendering, https-only links, strict CSP (ADR 0016) | REQ-NFR-013 |
| A cross-site page triggers a state-changing request | CSRF token, `Origin` check, one site for dashboard and API, no CORS (ADR 0016) | REQ-NFR-014 |
| Fetching a PDF or page reaches an internal address or a hostile file | Allowlisted fetcher with `https`, size and time limits, content-type check, no internal addresses | REQ-DATA-010, REQ-AGENT-013 |
| A forged bounce or complaint event from the email provider | Webhook signature verification and replay window | REQ-ACC-007 |
| A leaked API key or Cloudflare token | Secrets only in Cursor environment secrets or GitHub Actions secrets; secret scanning with push protection; least-privilege tokens per environment | REQ-NFR-001 |
| Model spending runs away | Daily budget and per-run cost reporting through AI Gateway | REQ-NFR-005 |
| Unauthorized access to opportunities | Invitation-only accounts and authentication in front of the dashboard and the API | REQ-NFR-007, REQ-ACC-001 |
| Mass signup or token guessing | No public registration; rate limits; 128-bit tokens stored as hashes | REQ-ACC-002, REQ-ACC-005 |
| Secrets exposed to untrusted code in CI | Pull request jobs run without secrets; live evals only for branches in this repository, in a protected `evals` environment that requires reviewer approval (ADR 0006) | REQ-TEST-003, REQ-TEST-004 |
| Redistribution of copyrighted papers | License recorded per document; PDFs stored and served only when the license allows it | REQ-DATA-010 |
| Vulnerable dependencies | Dependabot, pinned versions, and a dependency review gate in CI | see [CI gates](../test/ci-gates.md) |

## Authentication

Accounts exist by invitation only (ADR 0011, proposed). An administrator invites an email address; the invited person opens the emailed link, creates an account, and later signs in with one-time links sent through Resend. No passwords and no third-party identity providers are used.

| Control | Requirement |
|---|---|
| Account only from a valid invitation | REQ-ACC-001, REQ-ACC-002 |
| Random tokens, stored as hashes, short expiry, single use | REQ-ACC-002, REQ-ACC-004 |
| Same response for known and unknown email addresses, and a constant-time token comparison | REQ-ACC-004 |
| Rate limits on link requests and token use | REQ-ACC-005 |
| Roles and immediate revocation | REQ-ACC-006 |
| Verified sending domain, bounce handling, no link tracking | REQ-ACC-007 |
| Audit log without tokens | REQ-ACC-009 |
| Links survive mail scanners: the token is consumed on an explicit Continue | REQ-ACC-004 |
| Terms, privacy policy, and named processors | REQ-ACC-011 |

Users have one of three roles, viewer, analyst, or admin, set on the invitation and enforced by the API (REQ-NFR-012). The data API is read-only apart from the score review; sign-in, account, and admin routes are separate and each declares its roles (ADR 0018, REQ-API-005, REQ-ADM-004). Rate limits and global limits live in a Durable Object (ADR 0017). Multi-tenancy and organization profiles are later work (REQ-DASH-005, OQ-010). Records carry a user ID from the start so that later work does not need a migration.

## Personal data

- **Authors**: names, ORCIDs, and affiliations come from public scholarly records. They are stored to show provenance and are not used to profile people (REQ-NFR-009). The lawful basis, notice, and erasure process are in [privacy](privacy.md) (REQ-NFR-016).
- **Users**: name and email address, sign-in records, the role, the score reviews they write (REQ-SCORE-007), and the status notes they write (REQ-DASH-004). Users can delete their account (REQ-ACC-008). Resend processes email addresses to deliver invitations and sign-in links (ADR 0011). Usage and cost records are per pipeline run and agent, never per user (REQ-NFR-011).
- **Model providers**: publication text and agent prompts are sent to model providers. No user data is sent. Check the provider's data retention terms before going live (OQ-014). Retention periods for all data classes are in [privacy](privacy.md) (REQ-NFR-015).

## Model providers

- All calls go through AI Gateway (REQ-NFR-003), which is the single place to log, rate-limit, and switch providers.
- Provider keys are stored as secrets of the gateway or the Worker, never in code.
