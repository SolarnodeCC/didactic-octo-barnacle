---
title: "0107: Analysis round six: DeepSeek for Research Analyst, provisionally"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-14
related: [REQ-AGENT-001, REQ-TEST-005]
---

# 0107: Analysis round six: DeepSeek for Research Analyst, provisionally

- Decision status: Accepted
- Date: 2026-11-14
- Answers: OQ-036 for Research Analyst, provisionally
- Changes: `model.research_analyst` in [defaults](../architecture/defaults.md); the row of OQ-036 in [open questions](../open-questions.md). No requirement, prompt, label, or threshold changes.

## Context

Research Analyst ran on 14 November 2026 with `research-analyst@2` on the labels after the relabel of entry 010 ([ADR 0101](0101-analysis-round-three-results.md), [results](../test/analysis-benchmark-round-six-results.md)):

| Candidate | Pass rate per run | Run passes at | p50 latency | Cost per item |
|---|---|---|---|---|
| `gemma-4-26b-a4b-it`, thinking off | 57.6 / 57.6 / 60.6 % | 0.70 | 5.4 s | EUR 0.00040 |
| `deepseek-v4.1-flash-1017` | 66.7 / 72.7 / 78.8 % | 0.70 | 11.8 s | EUR 0.00188 |

Neither candidate passes every run. DeepSeek passes two of three and misses the first by two entries; Gemma passes none. Rescored after ADR 0101, DeepSeek's round-three answers gave 72.7 / 69.7 / 78.8 %, so over six runs on the same prompt and labels DeepSeek passed four and missed two, each by one or two entries.

Most of DeepSeek's failures are Novelty ranges it scores above (009, 017, 018, 022, 023, 025, 030), several of which the label review of [ADR 0099](0099-research-analyst-and-relevance-label-review.md) kept although other model families also scored them higher.

## Options considered

1. **Choose DeepSeek provisionally and review it on live output.** Chosen.
2. **Review the seven Novelty ranges and run again.** Declined for now; the ranges were reviewed once (ADR 0099), and a second review after another miss would come close to tuning the labels to the model.
3. **Keep Research Analyst open.** Phase 3 needs a Research Analyst model, and DeepSeek's misses are a few entries on one check.

## Decision

The owner chose, on 2026-11-14, after a question-and-answer review:

- **Research Analyst: `@cf/deepseek-ai/deepseek-v4.1-flash-1017` at its default reasoning, provisionally.** Prompt `research-analyst@2`, `json-schema` output.
- This departs from the rule that every run must pass ([ADR 0093](0093-analysis-agents-benchmark.md)): the first run of round six missed the 0.70 floor by two entries. It is accepted because DeepSeek passes four of six runs on this prompt and these labels, its mean over round six is 72.7 %, and Gemma, the only other candidate, is far below.
- The choice is reviewed after the first live sample of Research Analyst output, through the daily judge sample of [ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md), as Problem Discovery is reviewed once its fact judge decides ([ADR 0096](0096-analysis-round-one-results.md)).

## Consequences

- OQ-036 is answered for triage, extraction, and Relevance, provisionally for Research Analyst and Problem Discovery, and stays open for Market Analysis, Competition, and Startup Generator.
- The review may reopen the seven Novelty ranges with live evidence instead of benchmark answers.
- Round six cost EUR 0.23 (200 calls, USD 0.2522), the same as the gateway logs record.
