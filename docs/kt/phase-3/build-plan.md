---
title: Phase 3 build plan
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-28
related: [REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-005, REQ-AGENT-006, REQ-AGENT-007, REQ-AGENT-008, REQ-AGENT-009, REQ-AGENT-010, REQ-AGENT-011, REQ-AGENT-012, REQ-AGENT-013, REQ-AGENT-014, REQ-AGENT-015, REQ-AGENT-016, REQ-NFR-006, REQ-NFR-008, REQ-TEST-002, REQ-TEST-004, REQ-TEST-005, REQ-REV-009, REQ-REV-010, REQ-REV-011]
---

# Phase 3 build plan

Ten work packages. Each one is a pull request or a short series, and names its REQ-IDs. The gates and the order are in [dependencies](dependencies.md). Tests are named after the requirement they verify (`check:traceability`). Each agent follows the same pattern as triage and extraction in phase 2: first a prompt, a contract test on stubbed output, and a golden set with its threshold fixed in advance, and only then a live run in the `evals` environment.

| WP | Name | Requirements | Gate |
|---|---|---|---|
| WP0 | Readiness | (documents) | none |
| WP1 | Search tool on Tavily | REQ-AGENT-013 | none: gate-enabling |
| WP2 | Real orchestration | REQ-AGENT-007, REQ-AGENT-009, REQ-AGENT-010, REQ-AGENT-011, REQ-AGENT-012, REQ-AGENT-014, REQ-AGENT-016 | phase 2 exit |
| WP3 | Research Analyst, Problem Discovery, Relevance | REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-006 | phase 2 exit |
| WP4 | Market Analysis and Competition | REQ-AGENT-003, REQ-AGENT-004 | WP1, OQ-036 for both agents |
| WP5 | Startup Generator and validation brief | REQ-AGENT-005, REQ-AGENT-015 | WP4, OQ-036 for the agent |
| WP6 | Evidence checks and untrusted input | REQ-AGENT-008, REQ-NFR-006 | phase 2 exit |
| WP7 | Golden sets and evals in pull requests | REQ-TEST-004, REQ-TEST-005, REQ-TEST-002 | none: gate-enabling |
| WP8 | Review tool extensions | REQ-REV-009, REQ-REV-010, REQ-REV-011 | phase 2 exit |
| WP9 | Exit | REQ-NFR-008, phase 3 exit | all of the above |

## WP0: Readiness

- Write the missing plan files (solution, design, schema, exit evidence), then approve this plan.
- Re-review `requirements/agents.md`, `requirements/testing.md`, and the six agent documents in `agents/` against the models chosen since 2026-11-07 (ADR 0096 to ADR 0111).
- Split `requirements/agents.md` into a directory before it grows further (258 lines; the check warns above 250).
- **Exit:** every phase 3 document is `approved`, and the gates in [dependencies](dependencies.md) have an owner and a date.

## WP1: Search tool on Tavily

- Tavily is the provider, chosen without a comparison (ADR 0126, closes OQ-033).
- `agents/market` holds the search tool: `tavilySearch` calls the Tavily REST API with `fetch`, and `createSearchTool` bounds the calls per run, checks the budget, and records each call as a `model_call` row with `call_kind` `search`. `delimitSearchResults` in `packages/prompts` marks the results as untrusted data.
- Built on 2026-11-28 for REQ-AGENT-013 AC1, AC2, AC3, and AC5. AC4 (a competitor `Verified` only when a result supports it) is checked by the Competition agent in WP4.
- **Exit:** the tool passes its tests with no live calls (REQ-TEST-003), and WP4 uses it.

## WP2: Real orchestration

- Replace the stub steps of the thin slice's `CandidateWorkflow` with real agent steps, keeping the step interface that REQ-PROC-007 AC4 tests.
- Add contract-failure handling, structured output and repair through `callModel`, pinned model versions, and the global concurrency limit (ADR 0017).
- Add automatic recovery of candidate runs, using the limits of REQ-PROC-010.
- **Exit:** a candidate runs through every real step on stubbed models, and a failed step is re-driven within its limits.

## WP3: Research Analyst, Problem Discovery, Relevance

- Prompts and models from the analysis benchmark rounds: Problem Discovery (ADR 0111), Relevance (ADR 0106), and Research Analyst, which is provisional (ADR 0107) and is rerun to confirm it.
- The golden sets in `agents/analysis/evals` (33 entries each) and their thresholds are already in place.
- **Exit:** each agent meets its threshold in the `evals` environment.

## WP4: Market Analysis and Competition

- Golden sets and thresholds first (REQ-TEST-005), then a benchmark round that picks the model of each agent (OQ-036) and the judge where one is needed (OQ-020).
- Both agents use the search tool of WP1 for sourced figures and verified competitors (ADR 0013).
- **Exit:** each agent meets its threshold.

## WP5: Startup Generator and validation brief

- Same pattern as WP4. The agent writes the brief of the evidence-level design (ADR 0040).
- **Exit:** the agent meets its threshold.

## WP6: Evidence checks and untrusted input

- Every claim carries the evidence that REQ-AGENT-008 asks for. Publication and search text stays delimited and treated as untrusted. The hard checks and the adversarial set of ADR 0122 run on every agent.
- **Exit:** the adversarial set passes for every agent.

## WP7: Golden sets and evals in pull requests

- A golden set of at least 20 entries per analysis agent, covering the eight industries, with each entry confirmed by the owner (ADR 0072). Extend `scripts/check-golden-sets.py` to cover them.
- An evals CI job for pull requests from this repository that change prompts, model configuration, or an agent, in the `evals` environment (ADR 0006). The job blocks a merge below threshold.
- Contract tests for every analysis agent (REQ-TEST-002 AC3).
- **Exit:** a pull request that changes a prompt runs the evals of the affected agents.

## WP8: Review tool extensions

- Quotes shown in full-text context, review insights, and golden-set drafts from reviewed output. These moved from phase 2 by ADR 0125.
- **Exit:** a corrected review exports a draft entry that passes `scripts/check-golden-sets.py`.

## WP9: Exit

- Log lines of the candidate pipeline carry the opportunity ID. This closes REQ-NFR-008 AC1 (ADR 0125).
- Run the pipeline on the golden set. Record the cost per complete opportunity against the target of the [overview](../overview.md#success-measures).
- **Exit:** the phase 3 exit criteria of the [roadmap](../roadmap.md#exit-criteria) are met.
