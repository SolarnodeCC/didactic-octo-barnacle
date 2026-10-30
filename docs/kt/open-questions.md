---
title: Open questions
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Open questions

Questions that block or shape the build. Each has a proposal and the phase by which it must be answered. An answered question becomes an ADR or a change to a KT document, and its row is removed in the same pull request. IDs are never reused.

## Legal and people

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-014 | May we widen full-text use (transient processing, quotes from non-redistributable papers), and do the source and model provider terms allow commercial use? | Legal contact named by `@SolarnodeCC` answers the [review brief](legal/review-brief.md). Phase 1 stays abstract-first (ADR 0014). Phase 2 does not start until phase-2 gate questions are signed | before phase 2 starts |
| OQ-015 | Who are the named golden-set and calibration reviewers? | Fill the six slots in [golden sets](test/golden-sets.md); structure and sizes are fixed | before phase 3 |

## Ownership

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-034 | Who is the named owner per role once the team is staffed? | The MVP has one owner, `@SolarnodeCC`, for all areas; split the owner roles of the [KT README](README.md#ownership) and `.github/CODEOWNERS` when more people join | before launch |

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
| OQ-013 | Provisional phase 2 budget = daily limit × measured cost per publication × 1.5, recalculated after phase 1; phase 2 does not start without a measured cost per publication | REQ-NFR-005 |
| OQ-016 | Thin end-to-end slice first: one publication through every layer with stubbed agents by the end of phase 2 | REQ-PROC-007, [roadmap](roadmap.md) |
| OQ-019 | Single owner `@SolarnodeCC` for the MVP; splitting by role is OQ-034 | [KT README](README.md#ownership) |
| OQ-020 | Benchmark two or three models per agent on the golden set in phase 3; the eval judge uses a different provider than the agent it grades | [AI evals](test/ai-evals.md) |
| OQ-029 | Build the invitation and magic-link flow directly, no authentication library | ADR 0011 |
| OQ-031 | Superseded by OQ-033, which names the benchmark | ADR 0013 |
| OQ-032 | Provisional success targets accepted for phase 1; Precision/Explainability/Time saved/Cost reviewed at end of phase 3; Agreement in phase 4 | [Overview](overview.md) |
| OQ-004 | Live evals run only for branches in this repository, in the `evals` environment with required reviewer approval | ADR 0006 |
| OQ-025 | Thresholds 60 and 60, quadrants Pursue now, Needs technology, Quick win, Monitor, as configuration tuned on the calibration set | REQ-DASH-010 |
| OQ-026 | The MVP brief is a print-ready HTML page; a PDF renderer is a later change | REQ-DASH-009, ADR 0025 |
| OQ-028 | Admins only invite; pending cap of 50 by default; optional allowlist of email domains per environment | REQ-ACC-002 |
| OQ-011 | Default currency EUR and geography EU; global figures allowed when stated | [Market Analysis](agents/market-analysis.md) |
| OQ-027 | Opportunity status and decision note move into phase 4; organization profiles stay later | REQ-DASH-004 |
| OQ-030 | Audit log and sign-in records are kept 6 months, then deleted | [Privacy](architecture/privacy.md) |
| OQ-010 | One organization shares the research corpus in the MVP; user-owned records carry an organization key from the start | ADR 0019, REQ-NFR-018 |
| OQ-022 | Provider tool-use or JSON-schema mode through AI Gateway where available, always validated, mode recorded per agent | REQ-AGENT-010 |
| OQ-024 | Roles are chosen on the invitation and changed by an admin without a deployment | REQ-ACC-002, REQ-ACC-006, REQ-NFR-012 |
| OQ-006 | unpdf in the document-processing Queue consumer, with size and page caps and an abstract fallback | ADR 0009 |
| OQ-018 | Node 24, pnpm workspaces, TypeScript, Zod, Vitest with `@cloudflare/vitest-plugin`, Playwright | ADR 0008 |
| OQ-005 | Build against `bge-base-en-v1.5`; run the ADR 0010 benchmark at the start of phase 2 | ADR 0010, [defaults](architecture/defaults.md) |
| OQ-033 | Benchmark Brave Search and Tavily; pick the winner on a competitor-recall set at the start of phase 3 | ADR 0022 |
| OQ-021 | Daily budget = expected daily complete opportunities × measured cost × 1.25, locked before phase 4 scoring | ADR 0023 |
| OQ-017 | Organization profiles and organization-wide feedback come after the MVP | REQ-DASH-005 |
