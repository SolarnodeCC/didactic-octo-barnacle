---
title: "0088: Benchmark round two selects Gemma with thinking off for triage; extraction stays open"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-014, REQ-PROC-008, REQ-PROC-009, REQ-NFR-011, REQ-TEST-006]
---

# 0088: Benchmark round two selects Gemma with thinking off for triage; extraction stays open

- Decision status: Accepted
- Date: 2026-11-11
- Answers: OQ-036 for triage; extraction stays open
- Changes: `model.triage` in [defaults](../architecture/defaults.md) and the [phase 2 schema](../phase-2/schema.md), the row of OQ-036 in [open questions](../open-questions.md) and in the [phase 2 dependencies](../phase-2/dependencies.md)

## Context

Round two ran on 11 November 2026 with the candidates of [ADR 0086](0086-benchmark-round-two-candidates.md), the labels of [ADR 0084](0084-triage-label-review-round-two.md), and `extraction@3` ([ADR 0085](0085-one-primary-extraction-candidate.md)): three runs per item, price table `2026-11-11`, gateway `roi-staging`. The [results](../test/benchmark-round-two-results.md) hold the report summary; the raw responses are not committed.

| Benchmark ID | Step | Candidate | Pass rate per run | Threshold met in all runs |
|---|---|---|---|---|
| `bench-2026-11-11T09-39-07-497Z` | Triage | `@cf/google/gemma-4-26b-a4b-it+reasoning=off` | 87.9 / 86.8 / 86.8 % | yes |
| `bench-2026-11-11T09-39-05-003Z` | Triage | `@cf/google/gemma-4-26b-a4b-it` | 86.8 / 87.9 / 86.8 % | no: `StatedHarm` 79.1 % in run 3 |
| `bench-2026-11-11T09-39-09-933Z` | Triage | `@cf/openai/gpt-oss-120b` | 83.5 / 81.3 / 85.7 % | no: three signals below 0.80 |
| `bench-2026-11-11T09-39-12-526Z` | Extraction | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` | 87.2 / 76.9 / 82.1 % | no: run 2 |
| `bench-2026-11-11T09-39-15-057Z` | Extraction | `@cf/openai/gpt-oss-120b` | 66.7 / 82.1 / 76.9 % | no: runs 1 and 3 |

Triage is scored by the rule of [ADR 0087](0087-triage-passes-on-the-decision-with-a-signal-floor.md); under the earlier all-five rule no triage candidate passed more than 54.9 %. The threshold applies to every run, not to the mean (owner's decision, 2026-11-11), so DeepSeek, with a mean of 82.1 %, does not qualify.

Four extraction entries are labelled with no candidate under [ADR 0050](0050-no-candidate-without-an-actionable-party.md), and DeepSeek returned a candidate for them in 11 of 12 answers. ADR 0050 asks the owner to review such entries after the first extraction run. A blind cross-check by `llama-3.3-70b-instruct-fp8-fast` (another model family; it saw the text and the rule, not the label or DeepSeek's answer, [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md)) agreed with the labels of `gs-extraction-006` and `015`, named "supervisors" for `020` and "workers" for `022`, and agreed with the candidate of `021`, the entry where DeepSeek returned none. The owner kept all five labels: "supervisors" is the option ADR 0050 rejected, and "workers" is close to a generic party and came without a verbatim quote of the problem. No relabel that the cross-check supported would have lifted DeepSeek's run 2 to 0.80 (at best 79.5 %).

## Decision

- **`model.triage` is `@cf/google/gemma-4-26b-a4b-it` with thinking off** (`Reasoning: { Thinking: false }`), prompt `triage@2`, `json-schema` output, temperature 0 and at most 8192 output tokens from the prompt's sampling settings. It is the only triage candidate that meets the threshold, and also the cheapest and fastest: EUR 0.00008 per item, p50 latency 3 s, 97.8 % of entries stable over the three runs, one provider error in 274 calls. The Workers AI catalog (read 2026-11-11) lists it with no preview status and no planned deprecation, so decision rule 4 of the plan does not apply.
- **`model.extraction` stays unset**, and OQ-036 stays open for extraction. The labels of the five reviewed entries stay as they are.
- The price table stays `2026-11-11`: the estimates match the gateway logs (below).

## Consequences

- The triage step of WP5 uses this configuration (`TriageModel` in `apps/pipeline/src/processing-config.ts`). Its precision is 80.6 % and its recall 92.3 %: about one accepted publication in five is a false accept, which costs an extraction call, and fewer good publications are lost than with the default Gemma (recall 83.8 %).
- Cost check ([ADR 0054](0054-processing-runs-and-model-call-records.md)): AI Gateway logged 1,154 calls under the five benchmark IDs, USD 0.9284 in all. The usage records estimate USD 0.9280 (EUR 0.8290 at 1.1193); per benchmark, tokens and cost agree exactly except for two calls of a duplicate process under `…T09-39-05-003Z` that wrote no record (USD 0.0004). Round two and the cross-check cost about EUR 0.83 of the budget of EUR 5.
- Extraction needs a round three; the owner chooses its changes. Options seen in the data: DeepSeek's own failures in run 2 (3 quotes not verbatim, 1 schema failure); the rule of ADR 0050, which DeepSeek reads against the labels on three entries in every run; and the model judge of OQ-020 for `Finding` and `Customer`, still not part of the score.
- Phase 2 still waits for the extraction model (the gate of OQ-036 in the [dependencies](../phase-2/dependencies.md)).
