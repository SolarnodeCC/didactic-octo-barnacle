---
title: Benchmark round three results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-008, REQ-PROC-009, REQ-NFR-011, REQ-TEST-006]
---

# Benchmark round three: results

The result of round three of the [model benchmark plan](model-benchmark-plan.md), run on 11 November 2026 as [ADR 0090](../decisions/0090-extraction-prompt-four-and-benchmark-round-three.md) planned. [ADR 0091](../decisions/0091-benchmark-round-three-selects-the-extraction-model.md) draws the conclusion: DeepSeek runs extraction. This page holds the report summary; the raw responses are not committed.

## How it ran

- One candidate, `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, on `extraction@4` (ADR 0090) with the title and abstract cleaned of LaTeX markup ([ADR 0089](../decisions/0089-extraction-reads-text-without-latex-markup.md)); temperature 0, at most 8192 output tokens, `json-schema` output, three runs per item, three attempts per call.
- The 39 extraction entries of round two; only the markup in the quote of `gs-extraction-039` changed (ADR 0089).
- Gateway `roi-staging`, calls streamed, a checkpoint per run, budget EUR 5, price table `2026-11-11`. Benchmark ID `bench-2026-11-11T15-41-20-872Z`, from 15:41 to 16:11 UTC.

## Results

An extraction entry passes when the output matches the schema, every quote is verbatim in the text the step read, and the number of candidates equals the label's. A run passes at 0.80, and every run must pass.

| Run | Pass rate | Failures (count, quote, schema) |
|---|---|---|
| 1 | 87.2 % | 5, 0, 0 |
| 2 | 87.2 % | 4, 1, 0 |
| 3 | 89.7 % | 4, 0, 0 |

| Mean | Min | Threshold met in all runs | Stability | First-attempt valid | Failed after 3 attempts | Provider errors | p50 / p95 latency | Cost per item |
|---|---|---|---|---|---|---|---|---|
| 88.0 % | 87.2 % | yes | 92.3 % | 96.6 % | 0.9 % | 0 | 11.7 / 31.9 s | EUR 0.00210 |

Entries that failed at least once, with the result per run:

| Entry | Runs | What happened |
|---|---|---|
| `gs-extraction-002` | fail, fail, fail | A second candidate, "digital news outlets", next to the labelled regulators |
| `gs-extraction-020`, `022` | fail, fail, fail | A candidate where the label has none (ADR 0050) |
| `gs-extraction-015` | fail, fail, pass | The same; two candidates in run 2 |
| `gs-extraction-003` | fail, pass, fail | No candidate: the organization read as bare |
| `gs-extraction-010` | pass, fail, pass | An evidence quote with "was" for the text's "is" |

Compared with round two: `006`, `017`, `021`, and `039`, which failed there on industry scope, on a qualified organization, on the rule of ADR 0050, or on LaTeX markup, pass in every run. Count failures fell from 18 to 13, quote failures from 3 to 1, and schema failures from 1 to 0. Over the three runs DeepSeek returned more candidates than labelled 11 times, fewer 2 times, and the labelled number 104 times.

## Cost

| Benchmark ID | Estimate, table 2026-11-11 | Logged by AI Gateway | Calls (records / logged) |
|---|---|---|---|
| `bench-2026-11-11T15-41-20-872Z` | EUR 0.2451 (USD 0.2743) | USD 0.2743 | 122 / 122 |

Tokens and cost agree exactly. 107,840 of the 132,298 input tokens were billed at the cached-input price ([ADR 0078](../decisions/0078-cached-input-tokens-in-the-cost-estimate.md)).
