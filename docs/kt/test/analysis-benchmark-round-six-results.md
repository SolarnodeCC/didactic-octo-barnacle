---
title: Analysis benchmark round six results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-14
related: [REQ-AGENT-001, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round six: results

Research Analyst ran on 14 November 2026 with `research-analyst@2` ([ADR 0100](../decisions/0100-analysis-rerun-and-industry-rules-in-the-prompts.md)) on the labels after the relabel of entry 010 ([ADR 0101](../decisions/0101-analysis-round-three-results.md)). [ADR 0107](../decisions/0107-analysis-round-six-research-analyst-provisional.md) draws the conclusions. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompt `research-analyst@2`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries, three runs each, three attempts per call.
- Gateway `roi-staging`, from `main` at the merge of ADR 0106, 07:35 to 07:56 UTC; one process per candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Candidate |
|---|---|
| `bench-2026-11-14T07-35-41-972Z` | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-14T07-35-44-833Z` | `deepseek-v4.1-flash-1017` |

## Results

A run passes at 0.70 (minimum 0.75, tolerance 0.05); every run must pass. With 33 entries, 0.70 means 24 entries.

| Candidate | Round three (`research-analyst@2`, rescored after ADR 0101) | Round six | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|
| Gemma | 57.6 / 57.6 / 57.6 % | 57.6 / 57.6 / 60.6 % | no | 93.9 % | 5.4 s | EUR 0.00040 |
| DeepSeek | 72.7 / 69.7 / 78.8 % | 66.7 / 72.7 / 78.8 % | no, run 1 is two entries short | 81.8 % | 11.8 s | EUR 0.00188 |

Failures over the three runs (an entry can fail several checks):

| Candidate | Failures |
|---|---|
| Gemma | Maturity 23, Novelty 21, industries 2 |
| DeepSeek | Novelty 23, Maturity 5, industries 2 |

- **Novelty.** 17 of DeepSeek's 23 Novelty failures fall on 009, 017, 018, 022, 023, 025, and 030, all above the range. Five of them (009, 017, 018, 023, 025) are among the entries where at least two model families scored above the range in the label review of [ADR 0099](../decisions/0099-research-analyst-and-relevance-label-review.md), which kept the ranges.
- **Maturity.** Gemma misses Maturity in every run on 007, 008, 010, 021, 027, 030, and 035, mostly answering lab-result; DeepSeek misses on 017, 027, and 035.
- **Industries.** The care-provider rule holds: DeepSeek's two industry misses are on the cross-industry entry 018, Gemma's on 001.

## Cost

AI Gateway logged 200 model calls, USD 0.2522, the same as the usage records, call for call. In euro the round cost EUR 0.23 of its EUR 1.50 of budgets.
