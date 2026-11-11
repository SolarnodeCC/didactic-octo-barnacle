---
title: "0093: Benchmark of the analysis agents with a calibrated fact judge"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-006, REQ-AGENT-008, REQ-NFR-003, REQ-NFR-005, REQ-TEST-005]
---

# 0093: Benchmark of the analysis agents with a calibrated fact judge

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the prompts `research-analyst@1`, `problem-discovery@1`, and `relevance@1`; the output contracts of the three agents in `packages/models`; the eval of their golden sets and the `roi-benchmark` steps; the rubric `pd-facts@1`; the [model judge](../test/ai-evals.md#model-judge) section; and the analysis candidates of the [model benchmark plan](../test/model-benchmark-plan.md). No requirement changes.

## Context

OQ-036 is answered for triage and extraction ([ADR 0088](0088-benchmark-round-two-selects-the-triage-model.md), [ADR 0091](0091-benchmark-round-three-selects-the-extraction-model.md)) and stays open for the six analysis agents, which must have a model before phase 3. Research Analyst, Problem Discovery, and Relevance have golden sets of 33 entries each; Market Analysis, Competition, and Startup Generator have none, and the first two need recorded search results from a provider that OQ-033 picks at the start of phase 3. No prompt, contract schema, or eval of the analysis agents existed. Problem Discovery's labels list required facts in paraphrase, which code cannot match; the other two sets hold ranges and enums.

## Decision

The owner chose, on 2026-11-11:

- **Scope.** Benchmark Research Analyst, Problem Discovery, and Relevance now. The other three follow once OQ-033 has picked the search provider and their golden sets exist.
- **Candidates.** `@cf/google/gemma-4-26b-a4b-it` with thinking off and `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, for each of the three: the triage and extraction models. Clairic, a preview that returns only typed fields, is left out for now.
- **Frozen inputs.** Each agent reads the inputs stored in its golden set: the extraction candidate, and the `handoff` block and required facts of the entries it references, never another candidate's output. Relevance reads Problem Discovery as its labelled facts, the customer industry, and the PainLevel range.
- **Scoring.** An entry passes when every check passes (`entry-pass-rate`, thresholds 0.75, 0.75, and 0.85 with a tolerance of 0.05), and every run must pass:
  - Research Analyst: schema, Novelty in the range, the expected Maturity, every required industry named, and every `RelatedPublicationIds` item one of the neighbors given (evidence, REQ-AGENT-008).
  - Problem Discovery: schema, the expected customer industry, PainLevel in the range, and every required fact present according to the judge. A judge error fails the entry.
  - Relevance: schema, the expected industry among those with the highest `IndustryFit` (each tied industry counts), the computed `StrategicRelevanceScore` and `TechnicalFeasibility` in their ranges, and the expected effort. On a tie for the highest fit, the score uses the larger focus raise of the tied industries.
- **Judge.** `claude-haiku-5-5`, called through the Anthropic route of AI Gateway with structured output and effort `medium`, following the rubric `pd-facts@1` in `agents/analysis/evals/problem-discovery.rubric.md`. It gives one verdict per fact; a refusal, a wrong number of verdicts, or a cut-off answer is an error, never a verdict. It uses the official SDK `@anthropic-ai/sdk` (1.6.0, the newest release at least three days old, ADR 0074). Its price, USD 0.10 and 0.50 per million input and output tokens, is a constant of the judge, because the price table lists Workers AI models only; each call is recorded in `judge-calls.jsonl`.
- **Calibration.** Before the judge decides a round, the owner grades every required fact of at least 20 Problem Discovery outputs of both candidates, and the judge must agree on at least 90 % of the facts. Otherwise the rubric is revised and checked again. The agreement is recorded in the rubric file.
- **Budget.** EUR 5 for the whole round, model and judge calls together; the judge is refused like a model call once the budget is spent.
- **Key.** In CI the judge reads `EVAL_ANTHROPIC_API_KEY` from the GitHub environment `evals` (ADR 0049). In a cloud session the key is a network secret of the session for `gateway.ai.cloudflare.com`, entered by the owner in the session's secure form, never in chat or the repository.

The prompts add definitions the agent documents did not have: the four Maturity stages for Research Analyst and an `IndustryFit` scale for Relevance (0 for no link, about 50 when an organization of the industry plausibly has the problem, 80 or more when the industry itself carries it). The agent documents now carry them. Like extraction, the three prompts read titles and abstracts without LaTeX markup ([ADR 0089](0089-extraction-reads-text-without-latex-markup.md)); they quote nothing, so no quote check depends on it.

## Consequences

- The eval and the benchmark command stay in `agents/extraction` until `agents/analysis` has code of its own.
- Claude drafted the required facts of the golden set, and a Claude model now judges them. The judge uses another provider than the agents it grades (OQ-020), and the owner's calibration is the check that it does not favour its own wording.
- A round of three agents, two candidates, 33 entries, and three runs is about 600 model calls and 200 judge calls; at round three's prices that is about EUR 2 to 4.
- The next steps are a pilot run for the calibration sample, the owner's grading, and then the round, whose ADR selects a model per agent or keeps the agent open.
