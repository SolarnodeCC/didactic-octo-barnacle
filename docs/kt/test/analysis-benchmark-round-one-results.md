---
title: Analysis benchmark round one results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-12
related: [REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-006, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round one: results

The first round of Research Analyst, Problem Discovery, and Relevance, run on 12 November 2026 as [ADR 0093](../decisions/0093-analysis-agents-benchmark.md) planned, with the facts of Problem Discovery reported only ([ADR 0095](../decisions/0095-fact-judge-not-calibrated.md)). [ADR 0096](../decisions/0096-analysis-round-one-results.md) draws the conclusions. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompts `research-analyst@1`, `problem-discovery@1`, `relevance@1`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries per agent, three runs each, three attempts per call. Fact judge `claude-haiku-5-5` with rubric `pd-facts@3`, through Unified Billing.
- Gateway `roi-staging`, from `main` at the merge of ADR 0095, 12:51 to 13:14 UTC; one process per agent and candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Agent | Candidate |
|---|---|---|
| `bench-2026-11-12T12-51-53-011Z` | Research Analyst | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-12T12-51-55-321Z` | Research Analyst | `deepseek-v4.1-flash-1017` |
| `bench-2026-11-12T12-51-57-951Z` | Problem Discovery | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-12T12-52-00-374Z` | Problem Discovery | `deepseek-v4.1-flash-1017` |
| `bench-2026-11-12T12-52-02-818Z` | Relevance | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-12T12-52-05-293Z` | Relevance | `deepseek-v4.1-flash-1017` |

## Results

A run passes at the threshold minus 0.05: 0.70 for Research Analyst and Problem Discovery, 0.80 for Relevance; every run must pass.

| Agent | Candidate | Pass rate per run | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|
| Research Analyst | Gemma | 30.3 / 33.3 / 30.3 % | no | 97.0 % | 6.2 s | EUR 0.00040 |
| Research Analyst | DeepSeek | 36.4 / 42.4 / 39.4 % | no | 75.8 % | 12.2 s | EUR 0.00195 |
| Problem Discovery | Gemma | 78.8 / 75.8 / 78.8 % | yes | 97.0 % | 4.2 s | EUR 0.00022 |
| Problem Discovery | DeepSeek | 81.8 / 78.8 / 84.8 % | yes | 87.9 % | 8.4 s | EUR 0.00100 |
| Relevance | Gemma | 12.1 / 12.1 / 12.1 % | no | 100.0 % | 5.7 s | EUR 0.00014 |
| Relevance | DeepSeek | 12.1 / 6.1 / 15.2 % | no | 81.8 % | 13.0 s | EUR 0.00162 |

Failures over the three runs (an entry can fail several checks):

| Agent | Candidate | Failures |
|---|---|---|
| Research Analyst | Gemma | Novelty 36, Maturity 42, industries 22, related publication not given 2 |
| Research Analyst | DeepSeek | Novelty 44, Maturity 22, industries 15 |
| Relevance | Gemma | strategic relevance 87, effort 33, feasibility 9 |
| Relevance | DeepSeek | strategic relevance 71, effort 34, best industry 9, feasibility 6 |

- **Research Analyst** scores Novelty higher than the labels (often 55 to 85 against ranges of 20 to 70), and disagrees on Maturity and on the industries that must be named.
- **Relevance** gives the best industry an `IndustryFit` of 85 to 100 where the labels expect a strategic relevance of 25 to 65 for problems outside the industry's focus areas. The scale in `relevance@1` (80 or more when the industry itself carries the problem) reads every carried problem as a near-perfect fit; `relevance@2` scores fit against the focus areas instead ([ADR 0097](../decisions/0097-relevance-industry-fit-against-focus-areas.md)).
- **Problem Discovery**, on the code checks: the judge found 35, 35, and 34 of 66 required facts present for Gemma, and 34, 37, and 38 for DeepSeek, with no judge errors. These figures do not decide (ADR 0095).

## Relevance rerun with relevance@2

Relevance ran again at 15:23 UTC with `relevance@2` ([ADR 0097](../decisions/0097-relevance-industry-fit-against-focus-areas.md)): `bench-2026-11-12T15-23-09-199Z` (Gemma) passed 12.1 / 12.1 / 12.1 % and `bench-2026-11-12T15-23-11-452Z` (DeepSeek) 12.1 / 9.1 / 15.2 %. Both read nearly every problem as within a focus area (Gemma: `clear` on 32 of 33 entries); [ADR 0098](../decisions/0098-relevance-rerun-label-review.md) keeps Relevance open for a label review. The rerun cost EUR 0.19 (200 calls), the same as the gateway logs.

## Cost

AI Gateway logged 598 model calls and 198 judge calls, USD 0.6724, the same as the usage and judge records, call for call. In euro the round cost EUR 0.60 of its EUR 4.50 of budgets: EUR 0.53 for the models and EUR 0.07 for the judge.
