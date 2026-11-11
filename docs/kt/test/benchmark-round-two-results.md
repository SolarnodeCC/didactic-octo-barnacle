---
title: Benchmark round two results
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-PROC-008, REQ-PROC-009, REQ-NFR-011, REQ-TEST-006]
---

# Benchmark round two: results

The result of round two of the [model benchmark plan](model-benchmark-plan.md), run on 11 November 2026. [ADR 0088](../decisions/0088-benchmark-round-two-selects-the-triage-model.md) draws the conclusion: Gemma with thinking off runs triage, and extraction stays open. This page holds the report summary; the raw responses are not committed.

## How it ran

- Candidates of [ADR 0086](../decisions/0086-benchmark-round-two-candidates.md); labels after the review of [ADR 0084](../decisions/0084-triage-label-review-round-two.md) (91 triage entries, 39 extraction entries); prompts `triage@2` and `extraction@3` ([ADR 0085](../decisions/0085-one-primary-extraction-candidate.md)) at temperature 0 and at most 8192 output tokens, `json-schema` output, three runs per item, three attempts per call.
- Gateway `roi-staging`, calls streamed. One process per step and candidate, each with a budget of EUR 1 (EUR 5 in all). Price table `2026-11-11`.
- Each run was checkpointed ([ADR 0083](../decisions/0083-benchmark-checkpoint-and-resume.md)). No run had to be resumed. A resume started by mistake while the default Gemma round was still running made two calls before it was stopped; it wrote no record.
- The triage reports are re-graded with the pass rule of [ADR 0087](../decisions/0087-triage-passes-on-the-decision-with-a-signal-floor.md), decided after the round. The other measures do not depend on it.

## Triage

A triage entry passes when the decision that code derives from the signals is the labelled one; a run also needs every signal to agree with the labels on at least 80 % of the entries.

| Candidate | Pass rate per run | Lowest signal per run | Threshold met in all runs | All five signals right (earlier rule) |
|---|---|---|---|---|
| `gemma-4-26b-a4b-it+reasoning=off` | 87.9 / 86.8 / 86.8 % | `ExistingAlternative` 80.2 / 81.3 / 80.2 % | yes | 50.5 / 48.4 / 48.4 % |
| `gemma-4-26b-a4b-it` | 86.8 / 87.9 / 86.8 % | 80.2 / 83.5 / **79.1** % (`StatedHarm` in run 3) | no | 54.9 / 53.8 / 52.7 % |
| `gpt-oss-120b` | 83.5 / 81.3 / 85.7 % | `Trigger` **70.3 / 68.1 / 69.2** % | no | 37.4 / 34.1 / 36.3 % |

Signal agreement and the accept decision, mean over the runs:

| Candidate | NamedParty | StatedHarm | Trigger | ExistingAlternative | Adoptable | Precision | Recall |
|---|---|---|---|---|---|---|---|
| `gemma-4-26b-a4b-it+reasoning=off` | 90.5 % | 82.1 % | 89.0 % | 80.6 % | 86.4 % | 80.6 % | 92.3 % |
| `gemma-4-26b-a4b-it` | 91.6 % | 82.4 % | 89.0 % | 82.8 % | 87.5 % | 86.8 % | 83.8 % |
| `gpt-oss-120b` | 87.9 % | 78.4 % | 69.2 % | 76.2 % | 82.8 % | 76.2 % | 89.7 % |

| Candidate | Stability | First-attempt valid | Failed after 3 attempts | Provider errors | p50 / p95 latency | Cost per item |
|---|---|---|---|---|---|---|
| `gemma-4-26b-a4b-it+reasoning=off` | 97.8 % | 99.6 % | 0.0 % | 1 | 3.0 / 5.9 s | EUR 0.00008 |
| `gemma-4-26b-a4b-it` | 83.5 % | 87.5 % | 0.4 % | 5 | 33.5 / 92.7 s | EUR 0.00090 |
| `gpt-oss-120b` | 92.3 % | 98.2 % | 0.0 % | 0 | 9.5 / 17.0 s | EUR 0.00077 |

Stability is the share of entries with the same pass result in all three runs, under the rule of ADR 0087.

## Extraction

An extraction entry passes when the output matches the schema, every quote is verbatim, and the number of candidates equals the label's: 35 entries are labelled with one candidate and 4 with none.

| Candidate | Pass rate per run | Failures per run (count, quote, schema) | Stability | First-attempt valid | p50 / p95 latency | Cost per item |
|---|---|---|---|---|---|---|
| `deepseek-v4.1-flash-1017` | 87.2 / **76.9** / 82.1 % | 5, 0, 0 / 6, 3, 1 / 7, 0, 0 | 84.6 % | 91.5 % | 9.8 / 17.4 s | EUR 0.00177 |
| `gpt-oss-120b` | **66.7** / 82.1 / **76.9** % | 10, 5, 1 / 5, 5, 0 / 7, 6, 0 | 82.1 % | 79.5 % | 10.6 / 20.3 s | EUR 0.00122 |

- One primary candidate works: DeepSeek never returned more candidates than labelled. Of its 18 count failures, 11 are a candidate for an entry labelled with none (`gs-extraction-006`, `015`, `020` in every run, `022` in two), and 7 are no candidate where one is labelled, among them `gs-extraction-021` in every run.
- Without the four entries labelled with none, DeepSeek would pass 97.1 / 85.7 / 88.6 % of the remaining 35. The owner reviewed those labels and `021` with a blind cross-check and kept all of them (ADR 0088).
- `gpt-oss-120b` fails on quotes that are not verbatim (5 to 6 entries a run) as well as on the count.

## Cost

| Benchmark ID | Candidate | Estimate, table 2026-11-11 | Logged by AI Gateway | Calls (records / logged) |
|---|---|---|---|---|
| `…T09-39-07-497Z` | Triage, Gemma thinking off | EUR 0.0215 (USD 0.0240) | USD 0.0240 | 274 / 274 |
| `…T09-39-05-003Z` | Triage, Gemma | EUR 0.2466 (USD 0.2761) | USD 0.2765 | 314 / 316 |
| `…T09-39-09-933Z` | Triage, `gpt-oss-120b` | EUR 0.2107 (USD 0.2358) | USD 0.2358 | 278 / 278 |
| `…T09-39-12-526Z` | Extraction, DeepSeek | EUR 0.2071 (USD 0.2319) | USD 0.2319 | 134 / 134 |
| `…T09-39-15-057Z` | Extraction, `gpt-oss-120b` | EUR 0.1431 (USD 0.1602) | USD 0.1602 | 152 / 152 |
| **Round** | | **EUR 0.8290 (USD 0.9280)** | **USD 0.9284** | **1,152 / 1,154** |

- Tokens and cost agree per benchmark; the two extra logged calls are those of the mistaken resume.
- With a start-up check of five calls and the label cross-check of five calls (USD 0.0039 together), round two cost about EUR 0.83, within the budget of EUR 5.
