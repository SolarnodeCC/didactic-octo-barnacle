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
| OQ-001 | Which language and agent runtime? | LangGraph.js inside Cloudflare Workflows; drop CrewAI (ADR 0003) | phase 1 |
| OQ-002 | Which Cloudflare service implements each layer? | ADR 0004 | phase 1 |
| OQ-003 | How is each score category derived from agent output? | ADR 0005 | phase 4 |
| OQ-004 | How do live evals run for pull requests without exposing secrets? | ADR 0006 | phase 3 |
| OQ-005 | Which embedding model? | Reference model `bge-base-en-v1.5`; compare the candidates in ADR 0010 on the search fixture corpus (REQ-PROC-003) and select by benchmark | phase 2 |
| OQ-009 | How is the Next.js dashboard hosted? | Verify Cloudflare's current guidance; prefer the OpenNext adapter on Workers if Pages is no longer recommended for Next.js | phase 4 |
| OQ-020 | Which model runs each agent, and which model judges evals? | Pick per agent on the golden set by quality and cost; the judge uses a different provider than the agent it grades | phase 3 |
| OQ-022 | How is structured model output enforced across providers? | Use the provider's tool-use or JSON-schema mode through AI Gateway where available, and always validate with the schema from `packages/models`. Check on the golden set that the gateway passes the mode through, and record the mode per agent (REQ-AGENT-010) | phase 3 |
| OQ-023 | How is the number of concurrent model calls limited across Worker instances? | A per-instance semaphore is not enough, because instances multiply. Limit with Queue consumer concurrency and Workflow limits, plus provider rate limits at AI Gateway. Verify Cloudflare's current limits and how Retry-After is handled (REQ-AGENT-012) | phase 3 |

## Product and data

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-007 | Where do market figures come from? | Start with model estimates labeled as estimates; evaluate a market data source or a web search tool in phase 3 | phase 3 |
| OQ-008 | How are competitors found? | Connect a web search API as an agent tool, behind AI Gateway or a Worker; until then competitors are unverified | phase 3 |
| OQ-010 | Who are the users, and is the MVP multi-tenant? | One internal team behind Cloudflare Access; organization profiles later (REQ-DASH-005) | phase 4 |
| OQ-011 | Which default currency and geography do market figures use? | EUR and the EU, with global figures allowed when stated | phase 3 |
| OQ-012 | What is the ingestion scope: OpenAlex filters, arXiv categories, backfill window, daily volume? | arXiv categories in [arXiv](data-sources/arxiv.md); OpenAlex works of the last 30 days filtered by topics that match the target industries; measure the daily volume in phase 1 | phase 1 |
| OQ-013 | What provisional daily model budget applies before calibration? | A low fixed daily budget per environment, enough for triage and extraction on the configured daily volume (REQ-NFR-005) | phase 2 |
| OQ-021 | What calibrated daily model budget applies in production? | Measure cost per opportunity on the phase 3 golden set; lock the calibrated budget before scoring goes live | phase 4 |
| OQ-016 | Build layer by layer, or a thin end-to-end slice first? | One publication through every layer with stubbed agents by the end of phase 2, so the value of the output can be judged early | phase 1 |
| OQ-024 | How are user roles assigned? | Map Cloudflare Access groups to viewer, analyst, and admin; keep a small role table in the database only if group claims are not enough (REQ-NFR-012) | phase 4 |
| OQ-025 | Which thresholds and names define the quadrants of the priority matrix? | Start at 60 for Market Potential and 60 for Technical Feasibility, named Pursue now, Needs technology, Quick win, and Monitor; tune on the calibration set (REQ-DASH-010, REQ-SCORE-006) | phase 4 |
| OQ-026 | How is the opportunity brief rendered to PDF within Worker limits? | Evaluate a JavaScript PDF library and a Cloudflare-hosted HTML-to-PDF service on the brief layout; fall back to a print-ready HTML page (REQ-DASH-009) | phase 4 |
| OQ-027 | Does opportunity status (REQ-DASH-004) move into phase 4? | Yes, for the status and decision note only, because reviews already need user identity and a write API (REQ-SCORE-007, REQ-API-004). Organization profiles stay `later` | phase 4 |
| OQ-017 | When do organization profiles and feedback come? | After the MVP (REQ-DASH-004, REQ-DASH-005) | later |

## Legal and people

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-014 | May we store and show PDFs and full text, and do the source and model provider terms allow commercial use? | Legal review of arXiv, OpenAlex, and Semantic Scholar terms and of the provider data retention terms; store only openly licensed PDFs until then (REQ-DATA-010) | phase 1 |
| OQ-015 | Who reviews golden sets and the calibration set? | At least one reviewer per target industry, named in the golden set | phase 3 |
| OQ-019 | Who owns each KT document? | Name a person or role per document in `owner` instead of the organization handle | phase 1 |

## Answered

| ID | Answer | Record |
|---|---|---|
| OQ-006 | unpdf in the document-processing Queue consumer, with size and page caps and an abstract fallback | ADR 0009 |
| OQ-018 | Node 24, pnpm workspaces, TypeScript, Zod, Vitest with `@cloudflare/vitest-plugin`, Playwright | ADR 0008 |
