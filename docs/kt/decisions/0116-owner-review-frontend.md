---
title: "0116: An owner review tool on Workers behind Cloudflare Access"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-REV-001, REQ-REV-002, REQ-REV-003, REQ-REV-004, REQ-REV-005, REQ-NFR-013, REQ-NFR-021]
---

# 0116: An owner review tool on Workers behind Cloudflare Access

- Decision status: Accepted
- Date: 2026-11-24
- Changes: answers OQ-035 for the staging review hostname only

## Context

Triage and extraction run in phase 2, but the dashboard, the data API, and accounts are phase 4 (REQ-DASH-001, REQ-API-001, REQ-ACC-001). The owner wants to look at the model output and judge it now, without a database console. The only reviewer is the owner (ADR 0072). The bare domain `wispel.cc` is reserved for the product (ADR 0026), and staging and preview hostnames were open (OQ-035).

## Options considered

1. **Pull the phase 4 dashboard, API, and magic-link accounts forward.** Brings authentication, roles, and Next.js into phase 2 for one user.
2. **Query D1 by hand.** No code, but no way to read output next to its source text or record verdicts consistently.
3. **A small separate review tool behind Cloudflare Access.** One Worker with static assets and a JSON API, reading the staging database, with sign-in handled by Access in front of the hostname.

## Decision

Option 3.

- `apps/review` is one Worker: a React single-page app served as Workers static assets, and JSON routes under `/api/review/`. Only `/api/*` runs the Worker script first.
- It runs on Workers, not Cloudflare Pages, for the reasons of ADR 0012: Cloudflare recommends Workers for new projects, and the platform uses one Wrangler deployment model, one hardening check, and the same bindings everywhere.
- Staging serves it at `review.wispel.cc` as a Worker custom domain. Local runs on `wrangler dev`. Preview and production get no review tool.
- A Cloudflare Access application allows only the owner. The Worker verifies the Access token on every API request as well, so a misconfigured Access policy does not expose data. The reviewer is stored as the token's opaque `sub`, never as an email address.
- It reads `publication`, `triage_decision`, `extraction_result`, and `candidate`, and writes only `output_review` (migration 0014). Verdicts never change pipeline output.
- ADR 0016 applies: plain-text rendering, `https`-only links, a strict Content Security Policy, and an `Origin` check on writes.

## Consequences

- REQ-REV-001 to REQ-REV-005 describe the tool. The phase 4 dashboard can take over the screens under `/admin`, after which the tool is removed.
- The owner creates the Access application and sets its team domain and audience tag as variables of the GitHub environment `staging` before the first deploy; until then the deploy stops and the API refuses every request (operations).
- The hardening check covers every `wrangler.toml` in the repository, not only the pipeline's.
- Exported verdicts can seed golden-set entries; the owner still confirms each label (ADR 0072).
