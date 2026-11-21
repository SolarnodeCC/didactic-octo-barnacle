---
title: "0111: Problem Discovery is settled on the code checks"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-21
related: [REQ-AGENT-002, REQ-TEST-005]
---

# 0111: Problem Discovery is settled on the code checks

- Decision status: Accepted
- Date: 2026-11-21
- Answers: OQ-036 for Problem Discovery
- Changes: `model.problem_discovery` in [defaults](../architecture/defaults.md); the Evals section of the [Problem Discovery Agent](../agents/problem-discovery.md); the model judge section of [AI evals](../test/ai-evals.md); the rows of OQ-036 and OQ-020 in [open questions](../open-questions.md). No requirement, prompt, golden-set, or threshold changes.

## Context

Problem Discovery was chosen provisionally on the code checks, the customer industry and the PainLevel range, to be reviewed once the fact judge decides ([ADR 0096](0096-analysis-round-one-results.md)). Three calibrations of the judge against the owner did not reach the 90 % that [ADR 0093](0093-analysis-agents-benchmark.md) requires: 68 % on the pilot outputs, 74 % and 84 % (an upper estimate) on the reworked facts, and 68 % on fresh outputs with a frozen rubric ([ADR 0095](0095-fact-judge-not-calibrated.md), [ADR 0109](0109-fact-judge-rubric-pd-facts-4.md), [ADR 0110](0110-fact-judge-round-three-not-calibrated.md)).

On the code checks both candidates pass every run at 0.70:

| Round | `gemma-4-26b-a4b-it`, thinking off | `deepseek-v4.1-flash-1017` |
|---|---|---|
| Round one, 12 November (three runs) | 78.8 / 75.8 / 78.8 % | 81.8 / 78.8 / 84.8 % |
| 14 November, after the label review of ADR 0108 (one run) | 81.8 % | 78.8 % |
| Cost per item (round one) | EUR 0.00022 | EUR 0.00100 |

## Options considered

1. **Settle the model on the code checks and keep the judge report-only.** Chosen.
2. **Try a stronger judge model on the round-three outputs.** Declined by the owner.
3. **Use the owner's own grading of a sample as the fact check.** Declined by the owner.

## Decision

The owner chose, on 2026-11-21:

- **Problem Discovery: `@cf/google/gemma-4-26b-a4b-it` with thinking off, final.** Prompt `problem-discovery@1`, `json-schema` output. Both candidates pass the code checks in every run; decision rule 2 of the [model benchmark plan](../test/model-benchmark-plan.md) picks the cheaper.
- **The fact check does not decide a Problem Discovery model choice.** FACTS_GATE stays off. The judge, `claude-haiku-5-5` with `pd-facts@4`, keeps reporting its verdicts in benchmark reports for information; it is not calibrated again unless the owner asks.

## Consequences

- OQ-036 is answered for triage, extraction, Relevance, and Problem Discovery, provisionally for Research Analyst, and stays open for Market Analysis, Competition, and Startup Generator.
- The required facts of the golden set stay; they document the expected problem and feed the judge's report.
- Whether a Problem Discovery output names the right pain is not measured by any gate. The daily judge sample of live output ([ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md)) is the remaining signal.
