---
title: Benchmark round one results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-PROC-008, REQ-PROC-009, REQ-NFR-005, REQ-NFR-011, REQ-TEST-006]
---

# Benchmark round one: results

The result of round one of the [model benchmark plan](model-benchmark-plan.md), run as the [run plan](benchmark-round-one.md) sets out, on 10 November 2026. [ADR 0082](../decisions/0082-benchmark-round-one-selects-no-model.md) draws the conclusion: no candidate meets a threshold, so OQ-036 stays open for triage and extraction. This page holds the report summary; the raw responses are not committed.

## How it ran

- Prompts `triage@2` and `extraction@2` at temperature 0 and at most 8192 output tokens, `json-schema` output, three runs per item, three attempts per call ([ADR 0076](../decisions/0076-stream-benchmark-calls-and-larger-output-budget.md)).
- Gateway `roi-staging` (the gateway `roi-benchmark` does not exist), calls streamed, at least 3 seconds apart per model.
- One process per step and model, so four benchmark IDs, each with a budget of EUR 1.25 (EUR 5 in all, as the run plan sets).
- Price table `2026-11-06`. The table `2026-11-10` of [ADR 0078](../decisions/0078-cached-input-tokens-in-the-cost-estimate.md) was merged while the round ran.
- The container that ran the command was replaced at 08:55 UTC. The DeepSeek run had finished; the other three were started again from the beginning at 12:21 UTC.

| Benchmark ID | Step | Model |
|---|---|---|
| `bench-2026-11-10T08-20-05-105Z` | Extraction | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` |
| `bench-2026-11-10T12-21-14-407Z` | Triage | `@cf/zai-org/glm-4.7-flash` |
| `bench-2026-11-10T12-21-16-141Z` | Triage | `@cf/google/gemma-4-26b-a4b-it` |
| `bench-2026-11-10T12-21-18-099Z` | Extraction | `@cf/google/gemma-4-26b-a4b-it` |

## Results

The threshold of both steps is an entry pass rate of 0.85 with a tolerance of 0.05, so 0.80 passes ([golden sets](golden-sets.md#threshold-values)).

| Step | Model | Pass rate per run | Mean | Stability | First attempt valid | Failed after 3 attempts | Calls at 8192 tokens | p50 / p95 latency | EUR per item |
|---|---|---|---|---|---|---|---|---|---|
| Triage | `glm-4.7-flash` | 35.2 / 34.1 / 37.4 % | 35.5 % | 65.9 % | 88.6 % | 0.7 % | 36 of 308 | 45 / 81 s | 0.00112 |
| Triage | `gemma-4-26b-a4b-it` | 44.0 / 48.4 / 46.2 % | 46.2 % | 71.4 % | 82.8 % | 0.4 % | 49 of 327 | 34 / 83 s | 0.00100 |
| Extraction | `deepseek-v4.1-flash-1017` | 57.9 / 50.0 / 47.4 % | 51.8 % | 57.9 % | 93.0 % | 4.4 % | 0 of 127 | 15 / 32 s | 0.00267 |
| Extraction | `gemma-4-26b-a4b-it` | 55.3 / 71.1 / 57.9 % | 61.4 % | 71.1 % | 63.2 % | 23.7 % | 96 of 190 | 78 / 145 s | 0.00287 |

No run of any candidate meets the threshold. Provider errors were rare (1, 1, 6, and 2 in the order of the table) and all were retried; there was no 429 and no 410.

### Triage

A triage entry passes only when all five signals agree with the label and the decision that code derives from them is the labelled one.

| Model | NamedParty | StatedHarm | Trigger | ExistingAlternative | Adoptable | Accept decision correct | Precision | Recall |
|---|---|---|---|---|---|---|---|---|
| `glm-4.7-flash` | 81.0 % | 74.4 % | 85.3 % | 70.7 % | 82.8 % | 65 to 66 of 91 | 62.2 % | 89.5 % |
| `gemma-4-26b-a4b-it` | 93.8 % | 78.0 % | 87.5 % | 77.7 % | 86.8 % | 75 to 79 of 91 | 83.5 % | 79.8 % |

- The errors are spread over the signals, so the share of entries with all five right is far below each signal's agreement. `StatedHarm` and `ExistingAlternative` have the most errors for both models.
- 27 of the 91 entries fail in all six runs of both models. In 23 cases a signal of such an entry is wrong in all six runs: `ExistingAlternative` 9, `Adoptable` 7, and `StatedHarm` 7. Two models that agree with each other and not with the label point at the label or at the signal definition. Only 3 entries get the wrong accept decision in all six runs.

### Extraction

An extraction entry passes when the output matches the schema, every quote is verbatim, and the number of candidates equals the label's. 33 of the 38 entries are labelled with exactly one candidate, 4 with none, and 1 with two.

- `deepseek-v4.1-flash-1017` almost always answers in the schema with verbatim quotes. Its failures are the candidate count (15 to 20 entries a run): it returned more candidates than labelled 40 times, fewer 13 times, and the labelled number 59 times over the three runs.
- `gemma-4-26b-a4b-it` gets the count right when it answers (72 of 89 parsed answers), but in about half of its calls its reasoning runs to the 8192-token limit with no answer, and 23.7 % of its entries fail after three attempts.

## Cost

| Benchmark ID | Estimate, table 2026-11-06 | Logged by AI Gateway | Estimate / logged |
|---|---|---|---|
| `…T08-20-05-105Z` (DeepSeek) | EUR 0.3041 (USD 0.3395) | USD 0.3121 | 1.088 |
| `…T12-21-14-407Z` (GLM) | EUR 0.3066 (USD 0.3423) | USD 0.3427 | 0.999 |
| `…T12-21-16-141Z` (Gemma triage) | EUR 0.2719 (USD 0.3035) | USD 0.3033 | 1.001 |
| `…T12-21-18-099Z` (Gemma extraction) | EUR 0.3270 (USD 0.3650) | USD 0.3650 | 1.000 |
| **Round** | **EUR 1.2096** | **USD 1.3232** | |

- Every usage record has a gateway log entry, and the token counts agree for all but 4 of 952 records. The gateway returns a cost per Workers AI call (ADR 0054).
- The DeepSeek estimate is 8.8 % high because the table of 2026-11-06 has no cached-input price; ADR 0078 fixes that with the table of 2026-11-10.
- With the smoke samples of 9 and 10 November and the 99 calls of the runs stopped at 08:55 (USD 0.10), model cost was about EUR 1.3 in all, within the budget of EUR 5.

## Not measured in this round

- The request rate at 8 concurrent calls (`model.semaphore_max`) and the batch API of the benchmark plan's extra measurements: the command sends one call at a time per model.
- The model judge for `Finding` and `Customer` (OQ-020).
