---
title: Glossary
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Glossary

| Term | Meaning |
|---|---|
| ADR | Architecture decision record: one file in `decisions/` that records one decision, its context, and its consequences. |
| Agent | A component of the multi-agent engine that performs one analysis step and returns a fixed output contract. See [agents](agents/README.md). |
| Agent output | One stored result of an agent, inside the envelope described in [contract conventions](agents/contract-conventions.md). |
| Band | The label for a score range: Low, Medium, High, or Exceptional. See [scoring](scoring.md). |
| Business case | The short summary, key assumptions, and key risks that the Startup Generator returns with a concept. |
| Calibration set | Opportunities ranked by reviewers, used to check that scores agree with expert judgment (REQ-SCORE-006). |
| Candidate opportunity | A finding in one publication that might lead to an opportunity, produced by opportunity extraction (REQ-PROC-004). |
| Category | One of the five parts of the opportunity score, for example Market Potential. |
| Confidence | A number from 0 to 1 in an agent output that states how well the input supports it. |
| Contract test | A test that validates an agent's output against its output contract. |
| Core workflow | The eight conceptual steps from research to scoring in the [overview](overview.md). Not the same as a Cloudflare Workflow. |
| Eval | A repeatable evaluation of model output against a golden set, with a pass threshold. See [AI evals](test/ai-evals.md). |
| Evidence | A quote, related publication, or external URL that supports a field of an agent output (REQ-AGENT-008). |
| Finding | The research result that a candidate opportunity is based on, stated in one sentence. |
| Fixture | A recorded response from an external API or model, stored next to the tests that use it. |
| Golden set | A fixed set of papers with reviewed expected outcomes, used for evals. |
| Incomplete | The status of a publication or opportunity that misses a required field or category; it is not passed on or scored. |
| Industry fit | How well an opportunity fits one target industry, from 0 to 100, returned by the Relevance Agent. |
| KT document | A knowledge transfer document in `docs/kt/`. The KT documents are the source of truth for the project. |
| Model judge | A model that grades free-text agent output with a written rubric during evals. |
| Opportunity | A software product or service idea derived from a research finding, with its agent outputs and score. |
| Opportunity score | A weighted score from 0 to 100. See [scoring](scoring.md). |
| Output contract | The fields an agent must return, with their types and ranges. |
| Pain level | How severe the problem is for the customer, from 1 to 5, returned by the Problem Discovery Agent. |
| Phase | A roadmap phase from 1 to 4, or `later`. See [roadmap](roadmap.md). |
| Pipeline run | Durable work for one unit: a publication through triage and extraction, or one candidate through the agents and scoring (REQ-AGENT-007). |
| Preprint | A paper published on arXiv before or without peer review. |
| Publication | The canonical record of one paper, possibly found in several sources. See [data model](architecture/data-model.md). |
| REQ-ID | A requirement identifier in the form `REQ-<AREA>-<NNN>`, for example `REQ-DATA-001`. |
| SAM | Serviceable addressable market: the part of the TAM the opportunity can reach. |
| Score model version | The version of the weights and derivation rules a score was computed with. |
| Source record | The record of a publication as one source returned it. |
| Startup concept | The output of the Startup Generator: name, model, pricing, USP, features, and next steps. |
| TAM | Total addressable market. |
| Triage | The cheap filter that decides which publications go through the agent pipeline (REQ-PROC-005). |
| USP | Unique selling proposition. |
