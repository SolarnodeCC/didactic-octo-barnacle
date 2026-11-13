---
title: Analysis benchmark round four results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-NFR-011, REQ-TEST-005]
---

# Analysis benchmark round four: results

Relevance ran on 13 November 2026 with `relevance@4`, which counts three blockers for ImplementationEffort ([ADR 0102](../decisions/0102-effort-counts-three-blockers.md)). [ADR 0103](../decisions/0103-effort-passes-within-one-level.md) draws the conclusions. Research Analyst did not run, because nothing it reads changed. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompt `relevance@4`; temperature 0, at most 8192 output tokens, `json-schema` output; 33 golden-set entries, three runs each, three attempts per call.
- Gateway `roi-staging`, from `main` at the merge of ADR 0102, 11:58 to 12:25 UTC; one process per candidate, budgets EUR 0.50 (Gemma) and EUR 1 (DeepSeek), price table `2026-11-11`.

| Benchmark ID | Candidate |
|---|---|
| `bench-2026-11-13T11-58-42-920Z` | `gemma-4-26b-a4b-it+reasoning=off` |
| `bench-2026-11-13T11-58-32-369Z` | `deepseek-v4.1-flash-1017` |

## Results

A run passes at 0.80; every run must pass. The pass rates use the exact effort match that applied at the time of the run.

| Candidate | Round three (`relevance@3`) | Round four (`relevance@4`) | Passes | Stability | p50 latency | Cost per item |
|---|---|---|---|---|---|---|
| Gemma | 57.6 / 54.5 / 51.5 % | 54.5 / 54.5 / 60.6 % | no | 93.9 % | 5.2 s | EUR 0.00017 |
| DeepSeek | 60.6 / 63.6 / 60.6 % | 57.6 / 42.4 / 51.5 % | no | 72.7 % | 14.1 s | EUR 0.00192 |

Failures over the three runs (an entry can fail several checks):

| Candidate | Round three | Round four |
|---|---|---|
| Gemma | effort 30, strategic relevance 22, feasibility 7 | effort 28, strategic relevance 23, best industry 3, feasibility 1 |
| DeepSeek | effort 27, strategic relevance 14, best industry 5 | effort 34, strategic relevance 18, best industry 4, feasibility 2 |

- **Effort.** Both candidates now reason in blockers, but scope the MVP differently from the labels. On 019 and 027 the labels let the MVP work from exported data; both candidates assume a live link to telephony or asset systems and answer M against S. Gemma still counts power-system engineers (028) and aviation technicians (029) as domain experts. DeepSeek answers L against M on 022, 023, 028, and 030; on 023 it still argues from months (six to twelve months for supply-chain integrations). Only 3 of the 198 answers are two or more levels from the label.
- **Strategic relevance.** DeepSeek scores the care-provider entries 009 and 011 to 015 below their band (011 and 012 at 15, under the outside band), and 007 and 021 above it. Gemma still scores 002, 003, 007, 008, 011, 012, 018, and 021 above their band.

## Effort scored within one level

The same answers, scored with the tolerance of ADR 0103:

| Candidate | Exact effort | Within one level | Effort not checked |
|---|---|---|---|
| Gemma | 54.5 / 54.5 / 60.6 % | 72.7 / 72.7 / 75.8 % | 72.7 / 72.7 / 75.8 % |
| DeepSeek | 57.6 / 42.4 / 51.5 % | 81.8 / 69.7 / 75.8 % | 84.8 / 72.7 / 78.8 % |

Neither candidate reaches 0.80 in every run, with or without the effort check.

## Cost

AI Gateway logged 198 model calls, USD 0.2317, the same as the usage records, call for call. In euro the round cost EUR 0.21 of its EUR 1.50 of budgets.
