---
title: "0106: Analysis round five selects the Relevance model"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-TEST-005]
---

# 0106: Analysis round five selects the Relevance model

- Decision status: Accepted
- Date: 2026-11-13
- Answers: OQ-036 for Relevance; Research Analyst stays open
- Changes: `model.relevance` in [defaults](../architecture/defaults.md); the row of OQ-036 in [open questions](../open-questions.md)

## Context

Relevance ran on 13 November 2026 with `relevance@5`, effort scored within one level, and a per-run bar of 0.70 ([results](../test/analysis-benchmark-round-five-results.md)), after the label and prompt reviews of [ADR 0099](0099-research-analyst-and-relevance-label-review.md) to [ADR 0105](0105-relevance-threshold-aligned-with-the-analysis-agents.md).

| Candidate | Pass rate per run | Bar 0.70 | Bar 0.80 (before ADR 0105) | p50 latency | Cost per item |
|---|---|---|---|---|---|
| `gemma-4-26b-a4b-it`, thinking off | 78.8 / 75.8 / 75.8 % | passes | fails | 5.3 s | EUR 0.00018 |
| `deepseek-v4.1-flash-1017` | 87.9 / 81.8 / 93.9 % | passes | passes | 23.1 s | EUR 0.00288 |

Both pass. Decision rule 2 of the [model benchmark plan](../test/model-benchmark-plan.md) chooses the cheapest qualifying model, Gemma, "unless a more expensive one is clearly better on the main metric of the step and the owner accepts the cost". Gemma fails the same seven to eight entries in every run, all on strategic relevance: it reads broad focus areas such as "Public services" as covering the problem and answers the care-provider ceiling where the label is outside. DeepSeek's misses are spread over seven entries.

## Decision

The owner chose, on 2026-11-13, after a question-and-answer review:

- **Relevance: `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, final.** Prompt `relevance@5`, `json-schema` output. DeepSeek is clearly better on the entry pass rate, and the owner accepts the cost, for three reasons:
  - Gemma's errors are systematic, so in operation it would over-rate public-sector and cross-industry opportunities on every run, not occasionally.
  - DeepSeek also passes the 0.80 bar that applied before ADR 0105, so the choice does not depend on the threshold change made just before this round.
  - The cost difference is small in absolute terms: about EUR 29 against EUR 1.80 per 10,000 candidates.
- **Research Analyst stays open.** Its last run was round three on `research-analyst@2`. Rescored against the relabel of entry 010 ([ADR 0101](0101-analysis-round-three-results.md)), DeepSeek's answers pass 72.7 / 69.7 / 78.8 %, one entry short of 0.70 in the second run; Gemma's pass 57.6 %. Research Analyst runs again next, on `research-analyst@2` with both candidates and the usual budgets (about EUR 0.25), because its labels changed after its last run.

## Consequences

- OQ-036 is answered for triage, extraction, and Relevance, provisionally for Problem Discovery, and stays open for Research Analyst, Market Analysis, Competition, and Startup Generator.
- Relevance takes about 23 seconds per item at p50; it runs in the per-candidate Workflow ([orchestration](../architecture/orchestration.md)), not in a user request.
- The daily judge sample of [ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md) shows whether the misses on 007, 018, and 021 recur on live output.
- Round five cost EUR 0.30 (200 calls, USD 0.3388), the same as the gateway logs record.
