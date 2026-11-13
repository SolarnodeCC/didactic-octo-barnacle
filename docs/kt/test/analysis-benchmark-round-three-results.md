---
title: Analysis benchmark round three results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round three: results

Research Analyst and Relevance ran on 13 November 2026 with `research-analyst@2` and `relevance@3`, which state the owner's industry rules ([ADR 0100](../decisions/0100-analysis-rerun-and-industry-rules-in-the-prompts.md)). [ADR 0101](../decisions/0101-analysis-round-three-results.md) draws the conclusions. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompts `research-analyst@2` and `relevance@3`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries per agent, three runs each, three attempts per call.
- Gateway `roi-staging`, from `main` at the merge of ADR 0100, 09:56 to 10:20 UTC; one process per agent and candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Agent | Candidate |
|---|---|---|
| `bench-2026-11-13T09-55-54-590Z` | Research Analyst | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T09-55-57-346Z` | Research Analyst | `deepseek-v4.1-flash-1017` |
| `bench-2026-11-13T09-56-00-428Z` | Relevance | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T09-56-03-527Z` | Relevance | `deepseek-v4.1-flash-1017` |

## Results

A run passes at the threshold minus 0.05: 0.70 for Research Analyst, 0.80 for Relevance; every run must pass. The pass rates are scored against the labels at the time of the run, before entry 010 was relabeled (ADR 0101).

| Agent | Candidate | Round two | Round three | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|---|
| Research Analyst | Gemma | 45.5 / 45.5 / 45.5 % | 57.6 / 57.6 / 57.6 % | no | 100.0 % | 5.8 s | EUR 0.00040 |
| Research Analyst | DeepSeek | 69.7 / 69.7 / 63.6 % | 69.7 / 66.7 / 75.8 % | no | 75.8 % | 11.7 s | EUR 0.00199 |
| Relevance | Gemma | 45.5 / 45.5 / 45.5 % | 57.6 / 54.5 / 51.5 % | no | 84.8 % | 5.1 s | EUR 0.00016 |
| Relevance | DeepSeek | 63.6 / 57.6 / 54.5 % | 60.6 / 63.6 / 60.6 % | no | 66.7 % | 14.5 s | EUR 0.00191 |

Failures over the three runs (an entry can fail several checks):

| Agent | Candidate | Round two | Round three |
|---|---|---|---|
| Research Analyst | Gemma | Novelty 24, Maturity 23, industries 15 | Novelty 21, Maturity 22, industries 6 |
| Research Analyst | DeepSeek | Novelty 22, Maturity 8, industries 7 | Novelty 23, Maturity 8, industries 3 |
| Relevance | Gemma | strategic relevance 39, effort 34, feasibility 6, best industry 2 | effort 30, strategic relevance 22, feasibility 7 |
| Relevance | DeepSeek | effort 24, strategic relevance 18, best industry 11 | effort 27, strategic relevance 14, best industry 5 |

- **Research Analyst, industries.** All three of DeepSeek's industry failures are on `gs-research-analyst-010`: it answered `other` for radiologists, as `research-analyst@2` says, against a label of `life-sciences`. Rescored against the relabel of ADR 0101, DeepSeek passes 72.7 / 69.7 / 78.8 %; the second run still misses by one entry.
- **Research Analyst, Novelty.** 15 of DeepSeek's 23 Novelty failures fall on 009, 017, 018, 023, and 025, where at least two model families already scored above the range in the label review (ADR 0099).
- **Research Analyst, Maturity.** DeepSeek answers prototype for 017 and 029 and lab-result for 027 and 035 against the labels; Gemma answers lab-result for most prototypes and field tests.
- **Relevance, strategic relevance.** Gemma now keeps the care-provider entries 009, 010, 012, 013, and 015 in their band; it still scores above the band on 002, 003, 007, 008, 011, 018, and 021.
- **Relevance, effort.** Effort is now the largest Relevance failure for both candidates: about nine entries per run for DeepSeek, in both directions. The effort labels stay (ADR 0099).

## Cost

AI Gateway logged 399 model calls, USD 0.4946, the same as the usage records, call for call. In euro the round cost EUR 0.44 of its EUR 3 of budgets.
