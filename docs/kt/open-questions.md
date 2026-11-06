---
title: Open questions
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
---

# Open questions

Questions that block or shape the build. Each has a proposal and the phase by which it must be answered. An answered question becomes an ADR or a change to a KT document, and its row is removed in the same pull request. IDs are never reused.

## Legal and people

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-014 | May we widen full-text use (transient processing, quotes from non-redistributable papers), and do the source and model provider terms allow commercial use? | Legal contact named by `@SolarnodeCC` answers the [review brief](legal/review-brief.md). Phase 1 stays abstract-first (ADR 0014). Phase 2 does not start until phase-2 gate questions are signed | before phase 2 starts |
| OQ-015 | Who are the named golden-set and calibration reviewers? | Fill the ten slots (eight industries plus two shared) in [golden sets](test/golden-sets.md); structure and sizes are fixed | before phase 3 |

## Models

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-036 | Which model runs each model-backed step? | Cloudflare-hosted models only. Run the [model benchmark plan](test/model-benchmark-plan.md) on the golden sets, pick the cheapest model that meets each step's threshold, and record the result in an ADR | triage and extraction before phase 2 starts; the six analysis agents before phase 3 |
| OQ-043 | Does the provisional phase 2 budget cover triage of every ingested publication, embeddings, and full-text extraction input? | REQ-NFR-005 AC1 multiplies the daily limit (100) by a cost per publication that ADR 0032 defines as one triage and one extraction call on the abstract. Triage runs on every in-scope publication (about EUR 0.37 on the largest measured day alone, against a EUR 0.22 budget), embeddings run on all of them, and full text makes extraction input larger. Proposal: budget = (expected daily triaged publications × triage cost + daily limit × extraction cost + daily embeddings × embedding cost) × 1.5, with `extraction.full_text_max_chars` priced in, and REQ-NFR-005 AC1 changed to match ([phase 2 dependencies](phase-2/dependencies.md#cost-and-quotas)) | before phase 2 starts |

## Selection and validation

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-038 | Is a burden at population or sector level, with no party that can act on it, a candidate in extraction? | Add to REQ-PROC-009: no candidate when the stated burden belongs to a population or sector and no named customer can act on it. Entries `gs-extraction-015` (2602.11223) and `gs-extraction-020` (2609.10350) show the case. Decide after the first extraction eval run, with data | before phase 2 starts |
| OQ-041 | REQ-TEST-005 (golden sets and thresholds) is phase 3, but the phase 2 exit, REQ-PROC-006 AC3, and REQ-PROC-009 AC5 depend on the triage and extraction golden sets. Should REQ-TEST-005 move to phase 2 for those two steps? | Split it: the triage and extraction part becomes a phase 2 requirement, and the six analysis agents stay in phase 3. The golden sets and `scripts/check-golden-sets.py` already exist | before phase 2 starts |
| OQ-042 | How far back does the weekly retraction check look? | Ingestion re-reads only `ingestion.overlap_days` (2), so later retractions are found only by the weekly check of REQ-DATA-008. Proposal: `retraction.lookback_days` = `ingestion.max_age_days` (90), since nothing older is stored; widen it if opportunities live longer than that | before WP8 of the [phase 2 build plan](phase-2/build-plan.md) |

## Ownership

| ID | Question | Proposal | Decide before |
|---|---|---|---|
| OQ-034 | Who is the named owner per role once the team is staffed? | The MVP has one owner, `@SolarnodeCC`, for all areas; split the owner roles of the [KT README](README.md#ownership) and `.github/CODEOWNERS` when more people join | before launch |
| OQ-035 | Which hostnames do staging and preview use under `wispel.cc`, and does the API or admin area get its own subdomain? | Keep one site per environment on one registrable domain (ADR 0016); name the hostnames when the first environment is deployed, then record them in operations | before phase 4 launch checklist |

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
| OQ-013 | Provisional phase 2 budget = daily limit × cost per publication × 1.5, where phase 1 estimates the cost per publication from real data (ADR 0032) and the first model calls of phase 2 replace the estimate; phase 2 does not start without the estimate | REQ-NFR-005 |
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
| OQ-037 | Option B of ADR 0036: one analyst sets E3, `validated` needs all four elements at E3, the Startup Generator writes the brief, the label shows on the detail page only | ADR 0040, [evidence levels](evidence-and-readiness.md) |
| OQ-017 | Organization profiles and organization-wide feedback come after the MVP | REQ-DASH-005 |
| OQ-040 | Cloudflare-hosted models through Workers AI and AI Gateway for pipeline steps; one external provider through AI Gateway only for the eval judge | ADR 0049 |
