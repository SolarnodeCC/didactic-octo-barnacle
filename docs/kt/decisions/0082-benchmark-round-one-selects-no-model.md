---
title: "0082: Benchmark round one selects no model for triage or extraction"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-PROC-008, REQ-PROC-009, REQ-AGENT-014, REQ-NFR-005, REQ-NFR-011, REQ-TEST-006]
---

# 0082: Benchmark round one selects no model for triage or extraction

- Decision status: Accepted
- Date: 2026-11-10
- Answers: none (OQ-036 stays open for triage and extraction)
- Records: round one of the [model benchmark plan](../test/model-benchmark-plan.md), [results](../test/benchmark-round-one-results.md)

## Context

Round one ran on 10 November 2026 with the candidates of [ADR 0062](0062-replace-deprecated-benchmark-candidates.md), the prompts `triage@2` and `extraction@2` of [ADR 0076](0076-stream-benchmark-calls-and-larger-output-budget.md), three runs per golden-set item, through the AI Gateway `roi-staging`, with the price table `2026-11-06`.

| Step | Model | Benchmark ID | Mean pass rate | Best run | Threshold |
|---|---|---|---|---|---|
| Triage | `@cf/zai-org/glm-4.7-flash` | `bench-2026-11-10T12-21-14-407Z` | 35.5 % | 37.4 % | 0.85 (0.80 with tolerance) |
| Triage | `@cf/google/gemma-4-26b-a4b-it` | `bench-2026-11-10T12-21-16-141Z` | 46.2 % | 48.4 % | 0.85 |
| Extraction | `@cf/deepseek-ai/deepseek-v4.1-flash-1017` | `bench-2026-11-10T08-20-05-105Z` | 51.8 % | 57.9 % | 0.85 |
| Extraction | `@cf/google/gemma-4-26b-a4b-it` | `bench-2026-11-10T12-21-18-099Z` | 61.4 % | 71.1 % | 0.85 |

The round cost EUR 1.2096 by the estimate of the price table and USD 1.3232 (about EUR 1.19) by the AI Gateway logs; with the smoke samples and a restarted run, about EUR 1.3 of the budget of EUR 5. The gateway logs a cost per Workers AI call, and the estimate matched it within 0.1 % except for DeepSeek, 8.8 % high for want of a cached-input price, which [ADR 0078](0078-cached-input-tokens-in-the-cost-estimate.md) adds.

The failures have clear patterns ([results](../test/benchmark-round-one-results.md)):

- **Triage** needs all five signals right. Each model gets most signals right (Gemma 78 to 94 % per signal), but rarely all five. Gemma's derived accept decision is right for 75 to 79 of 91 entries (precision 83.5 %, recall 79.8 %). In 23 cases both models give the same answer against the label in all six runs, mostly on `ExistingAlternative`, `Adoptable`, and `StatedHarm`.
- **Extraction** with DeepSeek fails on the candidate count: it returns more candidates than the labels, which have exactly one for 33 of 38 entries. Gemma gets the count right when it answers, but its reasoning runs to the 8192-token limit in about half of its calls.

## Options considered

1. **Apply decision rule 5: no model for either step, OQ-036 open, a second round proposed.** Chosen by the owner before the result was known.
2. **Configure the best candidate per step as provisional** so phase 2 can proceed. Rejected: it would ship a step that misses its own threshold, against the pass rule of REQ-TEST-006.
3. **Lower the thresholds to the results.** Rejected: thresholds come from what the product needs and are fixed before the first run ([AI evals](../test/ai-evals.md)).

## Decision

- No candidate qualifies, so round one selects no model. OQ-036 stays open for triage and extraction, and the phase 2 gate on it stays closed ([dependencies](../phase-2/dependencies.md)).
- `model.triage` and `model.extraction` stay unset. The ADR that closes OQ-036 sets them.
- Round two needs the owner's choice among these options, each a change to be made in a reviewed pull request before any new call:
  - **Triage signal definitions and labels.** Review the 27 entries that fail in all six runs, and the 23 signal labels that both models contradict in every run, starting with `ExistingAlternative`, `Adoptable`, and `StatedHarm`. Fix a label or sharpen the definition in [triage](../agents/triage.md) and a new prompt version.
  - **Triage pass rule.** Whether an entry should pass on the derived accept decision instead of all five signals. This changes the threshold file and REQ-TEST-006, so it is the owner's decision and is written before the next run.
  - **Extraction candidate rule.** State in [opportunity extraction](../agents/opportunity-extraction.md) and a new prompt version when a publication yields more than one candidate, so the prompt and the labels follow the same rule, or review the labels where the model's extra candidates are sound.
  - **Reasoning setting for `gemma-4-26b-a4b-it` extraction.** The plan's one alternative reasoning setting for finalists (round two, Method step 5), because its reasoning often does not end within the budget.
  - **Other candidates.** The eligible models of the plan (`qwen3.8-27b`, `gpt-oss-20b`, `gpt-oss-120b`), read again on the day.
- ADR 0076 is accepted with this round.

## Consequences

- Phase 2 does not start until a model qualifies for triage and extraction.
- The cost figures stand: about EUR 0.0010 to 0.0011 per triage item and 0.0027 to 0.0029 per extraction item at this round's prices, far below the ceiling of 2 euro per opportunity (ADR 0023). They replace the placeholders of `cost-assumptions.json` when a model is chosen.
- The rate measurement at 8 concurrent calls and the batch API were not measured; they move to round two.
- A round that runs for hours should survive a replaced container: the command writes its files only at the end, so a restart lost about 35 minutes of three runs. A checkpoint per run is a candidate for the command before round two.
