---
title: Analysis benchmark round two results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round two: results

Research Analyst and Relevance ran again on 13 November 2026, after the label review of [ADR 0099](../decisions/0099-research-analyst-and-relevance-label-review.md), with the prompts of round one unchanged. [ADR 0100](../decisions/0100-analysis-rerun-and-industry-rules-in-the-prompts.md) draws the conclusions. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompts `research-analyst@1` and `relevance@2`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries per agent, three runs each, three attempts per call.
- Gateway `roi-staging`, from `main` at the merge of ADR 0099, 08:37 to 09:00 UTC; one process per agent and candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Agent | Candidate |
|---|---|---|
| `bench-2026-11-13T08-37-11-385Z` | Research Analyst | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T08-37-14-123Z` | Research Analyst | `deepseek-v4.1-flash-1017` |
| `bench-2026-11-13T08-37-17-163Z` | Relevance | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T08-37-20-175Z` | Relevance | `deepseek-v4.1-flash-1017` |

## Results

A run passes at the threshold minus 0.05: 0.70 for Research Analyst, 0.80 for Relevance; every run must pass.

| Agent | Candidate | Round one | Round two | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|---|
| Research Analyst | Gemma | 30.3 / 33.3 / 30.3 % | 45.5 / 45.5 / 45.5 % | no | 100.0 % | 6.4 s | EUR 0.00040 |
| Research Analyst | DeepSeek | 36.4 / 42.4 / 39.4 % | 69.7 / 69.7 / 63.6 % | no | 75.8 % | 12.1 s | EUR 0.00200 |
| Relevance | Gemma | 12.1 / 12.1 / 12.1 % | 45.5 / 45.5 / 45.5 % | no | 100.0 % | 6.5 s | EUR 0.00016 |
| Relevance | DeepSeek | 12.1 / 9.1 / 15.2 % | 63.6 / 57.6 / 54.5 % | no | 84.8 % | 13.7 s | EUR 0.00180 |

Relevance round one is the `relevance@2` rerun of [ADR 0098](../decisions/0098-relevance-rerun-label-review.md). Failures over the three runs (an entry can fail several checks):

| Agent | Candidate | Failures |
|---|---|---|
| Research Analyst | Gemma | Novelty 24, Maturity 23, industries 15 |
| Research Analyst | DeepSeek | Novelty 22, Maturity 8, industries 7 |
| Relevance | Gemma | strategic relevance 39, effort 34, feasibility 6, best industry 2 |
| Relevance | DeepSeek | effort 24, strategic relevance 18, best industry 11 |

- **Research Analyst, Novelty.** 16 of DeepSeek's 22 Novelty failures fall on the entries where at least two model families already scored above the range in the label review (009, 018, 023, 025, 027, 035); ADR 0099 left those ranges as they are.
- **Research Analyst, industries.** Gemma (009, 012 to 015) and DeepSeek (009, 014) answer `life-sciences` for care providers where the labels require `other`. The prompt says only "use other only when none of the eight applies".
- **Relevance, strategic relevance.** Gemma still scores 80 to 100 on every entry the labels put in the indirect or outside band (002, 003, 007 to 015, 018, 021), most of them care providers or cross-industry customers. `relevance@2` does not say that a care provider or a cross-industry customer is at most indirect.
- **Relevance, best industry.** DeepSeek picks `public-sector` for care providers and the cross-industry entry 018 (009, 011, 014, 018).
- **Relevance, effort.** Gemma answers M on six entries labeled L (009, 021, 023, 026, 032, 033) and L on five labeled M (002, 003, 008, 013, 027); DeepSeek misses in both directions. The effort labels stay (ADR 0099).

## Cost

AI Gateway logged 397 model calls, USD 0.4821, the same as the usage records, call for call. In euro the round cost EUR 0.43 of its EUR 3 of budgets.
