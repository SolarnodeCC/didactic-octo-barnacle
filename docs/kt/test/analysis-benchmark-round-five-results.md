---
title: Analysis benchmark round five results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round five: results

Relevance ran on 13 November 2026 with `relevance@5` ([ADR 0104](../decisions/0104-care-provider-limit-is-a-ceiling.md)), effort scored within one level ([ADR 0103](../decisions/0103-effort-passes-within-one-level.md)), and the threshold of [ADR 0105](../decisions/0105-relevance-threshold-aligned-with-the-analysis-agents.md). [ADR 0106](../decisions/0106-analysis-round-five-selects-the-relevance-model.md) draws the conclusions. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompt `relevance@5`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries, three runs each, three attempts per call.
- Gateway `roi-staging`, from `main` at the merge of ADR 0104 and ADR 0105, 17:38 to 18:05 UTC; one process per candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Candidate |
|---|---|
| `bench-2026-11-13T17-38-43-684Z` | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T17-38-46-572Z` | `deepseek-v4.1-flash-1017` |

## Results

A run passes at 0.70 (minimum 0.75, tolerance 0.05); every run must pass.

| Candidate | Round four (`relevance@4`, effort within one level) | Round five (`relevance@5`) | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|
| Gemma | 72.7 / 72.7 / 75.8 % | 78.8 / 75.8 / 75.8 % | yes | 97.0 % | 5.3 s | EUR 0.00018 |
| DeepSeek | 81.8 / 69.7 / 75.8 % | 87.9 / 81.8 / 93.9 % | yes | 81.8 % | 23.1 s | EUR 0.00288 |

Round four is rescored with the effort tolerance of ADR 0103. Both candidates pass every run. DeepSeek also passes the 0.80 bar that applied before ADR 0105; Gemma does not.

Failures over the three runs (an entry can fail several checks):

| Candidate | Failures | Entries |
|---|---|---|
| Gemma | strategic relevance 23, feasibility 1 | 002, 003, 007, 008, 012, 018, 021 in every run; 011 in two |
| DeepSeek | strategic relevance 9, best industry 3, effort 1, feasibility 1 | 007 in every run; 018, 021, and 028 in two; 009, 014, and 016 once |

- **Gemma** misses are systematic: it scores 100 on 002, 007, 008, and 021, reading broad focus areas such as "Public services" as covering the problem, and it still answers the care-provider ceiling (75) on 011, 012, and 018, which are labeled outside.
- **DeepSeek** drops a care-provider entry below its band only once (014); its misses are spread over seven entries.
- **Effort** passes within one level on all but one answer.

## Cost

AI Gateway logged 200 model calls, USD 0.3388, the same as the usage records, call for call. In euro the round cost EUR 0.30 of its EUR 1.50 of budgets.
