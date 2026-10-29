---
title: Open questions
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Open questions

Questions that block or shape the build. Each has a proposal and the phase by which it must be answered. An answered question becomes an ADR or a change to a KT document, and its row is removed in the same pull request. IDs are never reused.

## Architecture and technology

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-004 | How do live evals run for pull requests without exposing secrets? | ADR 0006 | phase 3 |
| OQ-005 | Which embedding model? | Reference model `bge-base-en-v1.5`; compare the candidates in ADR 0010 on the search fixture corpus (REQ-PROC-003) and select by benchmark | phase 2 |
| OQ-020 | Which model runs each agent, and which model judges evals? | Pick per agent on the golden set by quality and cost; the judge uses a different provider than the agent it grades | phase 3 |
| OQ-022 | How is structured model output enforced across providers? | Use the provider's tool-use or JSON-schema mode through AI Gateway where available, and always validate with the schema from `packages/models`. Check on the golden set that the gateway passes the mode through, and record the mode per agent (REQ-AGENT-010) | phase 3 |

## Product and data

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-010 | Who are the users, and is the MVP multi-tenant? | External users by invitation only, one shared workspace (ADR 0011); organization profiles later (REQ-DASH-005) | phase 4 |
| OQ-011 | Which default currency and geography do market figures use? | EUR and the EU, with global figures allowed when stated | phase 3 |
| OQ-013 | What provisional daily model budget applies before calibration? | A low fixed daily budget per environment, enough for triage and extraction on the configured daily volume (REQ-NFR-005) | phase 2 |
| OQ-021 | What calibrated daily model budget applies in production? | Measure cost per opportunity on the phase 3 golden set; lock the calibrated budget before scoring goes live | phase 4 |
| OQ-016 | Build layer by layer, or a thin end-to-end slice first? | One publication through every layer with stubbed agents by the end of phase 2, so the value of the output can be judged early | phase 1 |
| OQ-024 | How are user roles assigned? | Roles (viewer, analyst, admin) are stored with the user and chosen on the invitation (ADR 0011, REQ-ACC-002); no Cloudflare Access groups (REQ-NFR-012) | phase 4 |
| OQ-025 | Which thresholds and names define the quadrants of the priority matrix? | Start at 60 for Market Potential and 60 for Technical Feasibility, named Pursue now, Needs technology, Quick win, and Monitor; tune on the calibration set (REQ-DASH-010, REQ-SCORE-006) | phase 4 |
| OQ-026 | How is the opportunity brief rendered to PDF within Worker limits? | Evaluate a JavaScript PDF library and a Cloudflare-hosted HTML-to-PDF service on the brief layout; fall back to a print-ready HTML page (REQ-DASH-009) | phase 4 |
| OQ-027 | Does opportunity status (REQ-DASH-004) move into phase 4? | Yes, for the status and decision note only, because reviews already need user identity and a write API (REQ-SCORE-007, REQ-API-004). Organization profiles stay `later` | phase 4 |
| OQ-028 | Who may invite, and what limits apply? | Admins only; a cap on pending invitations; an optional allowlist of email domains (REQ-ACC-002) | phase 4 |
| OQ-029 | Build the invitation and magic-link flow directly, or use an authentication library? | Evaluate a maintained library that supports invitation-gated magic links on Workers and D1; build directly if none fits (ADR 0011) | phase 4 |
| OQ-030 | How long are the audit log and sign-in records kept? | 12 months, then deleted; state it in the privacy policy (REQ-ACC-009, REQ-ACC-011) | phase 4 |
| OQ-031 | Which web search provider do Market Analysis and Competition use? | Compare two providers on the golden set for competitor recall, cost per call, terms for storing results, and data processing agreement (ADR 0013, REQ-AGENT-013) | phase 3 |
| OQ-032 | Are the provisional success targets in the [overview](overview.md) right? | Product owner confirms or changes the five targets and the baseline method before phase 1 | phase 1 |
| OQ-017 | When do organization profiles and feedback come? | After the MVP (REQ-DASH-004, REQ-DASH-005) | later |

## Legal and people

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-014 | May we widen full-text use (transient processing, quotes from non-redistributable papers), and do the source and model provider terms allow commercial use? | Legal review of arXiv, OpenAlex, and Semantic Scholar terms and of the provider terms. Phase 1 and 2 run abstract-first and store only license-permitted PDFs (ADR 0014, REQ-DATA-010) | phase 2 |
| OQ-015 | Who reviews golden sets and the calibration set? | At least one reviewer per target industry, named in the golden set | phase 3 |
| OQ-019 | Which person or team holds each owner role listed in the [KT README](README.md#ownership)? | Name one per role, then use it in `owner` and in `.github/CODEOWNERS` | phase 1 |

## Answered

| ID | Answer | Record |
|---|---|---|
| OQ-001 | Plain TypeScript agents as Workflow steps; LangGraph and CrewAI dropped | ADR 0003 |
| OQ-002 | Layer-to-service mapping, with Durable Objects added | ADR 0004, ADR 0017 |
| OQ-003 | Category derivation rules, geometric mean of SAM, no uniform penalty for estimates | ADR 0005 |
| OQ-007 | Market figures are sourced through the search tool where possible, else labeled estimates | ADR 0013 |
| OQ-008 | Competitors are verified through the search tool | ADR 0013 |
| OQ-009 | Dashboard on Workers with the OpenNext adapter | ADR 0012 |
| OQ-012 | Narrow pilot scope with a topic map; daily volume is measured in phase 1 | [Ingestion scope](data-sources/ingestion-scope.md) |
| OQ-023 | Global model-call limit in a Durable Object semaphore | ADR 0017 |
| OQ-006 | unpdf in the document-processing Queue consumer, with size and page caps and an abstract fallback | ADR 0009 |
| OQ-018 | Node 24, pnpm workspaces, TypeScript, Zod, Vitest with `@cloudflare/vitest-plugin`, Playwright | ADR 0008 |
