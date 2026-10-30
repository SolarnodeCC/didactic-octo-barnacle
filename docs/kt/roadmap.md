---
title: MVP roadmap
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# MVP roadmap

The `Phase` field of each requirement refers to these phases. `later` means after phase 4. The `Phase` field is the source of truth; the lists below must match it.

| Phase | Theme | Deliverables |
|---|---|---|
| 1 | Research ingestion | Toolchain and CI, OpenAlex and arXiv integration on the pilot scope, deduplication, scheduled runs, idempotent queues, license-gated PDF storage, metadata extraction, run reports, author-data process |
| 2 | Research understanding | Full text where licensed, embeddings, vector database, semantic search, triage with its contract, opportunity extraction, cost budget, the thin end-to-end slice with stubbed agents |
| 3 | AI opportunity generation | All six agents, the search tool, the pipeline, evidence checks, golden sets and evals |
| 4 | Business intelligence | Scoring engine, data API and auth/admin API, dashboard, ranking, trends, authentication, admin operations, privacy and service levels |

## Requirements per phase

| Phase | Requirements |
|---|---|
| 1 | REQ-DATA-001, REQ-DATA-002, REQ-DATA-004, REQ-DATA-005, REQ-DATA-007, REQ-DATA-009, REQ-DATA-010, REQ-NFR-001, REQ-NFR-002, REQ-NFR-004, REQ-NFR-008, REQ-NFR-009, REQ-NFR-016, REQ-NFR-019, REQ-NFR-020, REQ-DATA-011, REQ-TEST-001, REQ-TEST-003 |
| 2 | REQ-DATA-006, REQ-DATA-008, REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-PROC-004, REQ-PROC-005, REQ-NFR-003, REQ-NFR-005, REQ-NFR-010, REQ-NFR-011, REQ-PROC-006, REQ-PROC-007, REQ-TEST-002 |
| 3 | REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-005, REQ-AGENT-006, REQ-AGENT-007, REQ-AGENT-008, REQ-AGENT-009, REQ-AGENT-010, REQ-AGENT-011, REQ-AGENT-012, REQ-AGENT-013, REQ-AGENT-014, REQ-NFR-006, REQ-TEST-004, REQ-TEST-005 |
| 4 | REQ-SCORE-001, REQ-SCORE-002, REQ-SCORE-003, REQ-SCORE-004, REQ-SCORE-005, REQ-SCORE-006, REQ-SCORE-007, REQ-API-001, REQ-API-002, REQ-API-003, REQ-API-004, REQ-DASH-001, REQ-DASH-002, REQ-DASH-003, REQ-DASH-004, REQ-DASH-006, REQ-DASH-007, REQ-DASH-008, REQ-DASH-009, REQ-DASH-010, REQ-DASH-011, REQ-DASH-012, REQ-DASH-014, REQ-NFR-007, REQ-NFR-012, REQ-ACC-001, REQ-ACC-002, REQ-ACC-003, REQ-ACC-004, REQ-ACC-005, REQ-ACC-006, REQ-ACC-007, REQ-ACC-008, REQ-ACC-009, REQ-ACC-010, REQ-ACC-011, REQ-API-005, REQ-API-006, REQ-DASH-015, REQ-ADM-001, REQ-ADM-002, REQ-ADM-003, REQ-ADM-004, REQ-NFR-013, REQ-NFR-014, REQ-NFR-015, REQ-NFR-017, REQ-NFR-018 |
| later | REQ-DATA-003, REQ-DASH-005, REQ-DASH-013 |

The Research Analyst, Problem Discovery, and Relevance agents are in phase 3 because the phase 3 agents need their output and the phase 4 scoring engine needs Scientific Novelty, Technical Feasibility, and Strategic Relevance. Semantic Scholar stays `later`: OpenAlex already provides citation counts, and Semantic Scholar adds citation graphs and recommendations on top.

## Definition of Ready for a phase

A phase starts when:

1. The requirement files for its requirements are `approved` (see [requirements review](requirements/README.md#review)).
2. The open questions marked for that phase in [open questions](open-questions.md) are answered or have an accepted ADR. OQ-005 is closed (ADR 0010); OQ-014 remains the legal gate for phase 2; OQ-015 remains the reviewer-naming gate for phase 3.
3. The previous phase meets its exit criteria.
4. Phase 2 also needs the written legal answer of OQ-014 ([review brief](legal/review-brief.md)) and the cost per publication from phase 1 (REQ-NFR-005), which is an estimate from real phase 1 data (ADR 0032) because phase 1 makes no model calls; the first measured cost comes from the first model calls in phase 2.

## Exit criteria

| Phase | Done when |
|---|---|
| 1 | A scheduled run ingests the pilot scope from OpenAlex and arXiv into the development environment without duplicates, delivering every queue message twice changes nothing, the run report shows counts and failures, and the daily volume is measured on the deployed pipeline and the cost per publication is estimated from it, both recorded in [ingestion scope](data-sources/ingestion-scope.md) (ADR 0032). |
| 2 | A semantic search on the fixture corpus reaches recall at 10 of at least 0.8, and triage plus extraction meet their golden-set thresholds and produce candidates within the daily budget. The thresholds are written down before the first run (REQ-TEST-005). The thin slice (REQ-PROC-007) runs end to end with stubbed agents. |
| 3 | Every agent meets the eval threshold fixed for it before its first run, and the pipeline produces complete, evidence-backed outputs for the golden set within the cost per complete opportunity target of the [overview](overview.md). |
| 4 | Authenticated users can rank, filter, and open explained opportunities in the dashboard, admins can hide and rerun, the calibration report shows Spearman at least 0.6 with its interval (REQ-SCORE-006), and the launch checklist in [operations](operations.md) is complete. |
