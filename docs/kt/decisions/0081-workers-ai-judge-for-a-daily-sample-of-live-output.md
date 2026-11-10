---
title: "0081: A Workers AI judge grades a small daily sample of live output"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-NFR-023, REQ-NFR-008, REQ-NFR-005, REQ-TEST-007]
---

# 0081: A Workers AI judge grades a small daily sample of live output

- Decision status: Accepted
- Date: 2026-11-10
- Answers: OQ-045 (live judge; this row was numbered OQ-044 when it was written)
- Supplements: [0049](0049-workers-ai-for-pipeline-anthropic-for-judge.md) and [0071](0071-automatic-quality-monitoring-from-run-signals.md)

## Context

ADR 0071 watches live triage and extraction output with run signals and no model call. Signals show a change, such as more empty results or more repairs, and cannot show whether a candidate is any good. ADR 0049 limits the Anthropic judge to golden-set items in the `evals` environment, so it may not read live output. Live output is the publication text and the step's answer, which Workers AI already processes for the pipeline.

## Options considered

1. **A Workers AI judge on a small daily sample, report-only.** Chosen by the owner.
2. **The run-signal monitor only.**
3. **The Anthropic judge on live output.** Needs a legal answer on sending live text to a second provider.

## Decision

- A separate Workers AI model grades a small daily sample of live triage and extraction output. The data stays with Cloudflare, the processor of the pipeline (ADR 0049).
- The judge model is not the model that produced the output, and is of another family where one is available. It is chosen from the benchmark candidates and fixed by an ADR with a pinned version (REQ-AGENT-014).
- The judge is report-only. It never blocks a run, changes a score, or alters, hides, or removes a candidate. Its result is a section of the daily report next to the quality metrics of ADR 0071.
- The sample size per step per day, the judge rubric, and the alert threshold are configuration, set with the first reports. A judge result alerts only through the path of REQ-NFR-019, and only after the threshold is written down.
- The judge has its own budget line, separate from the daily budget of REQ-NFR-005. When the line is reached the judge stops for the day and the pipeline is not affected.
- Before its results are used, the judge is checked against the owner's labels on the golden set, as [AI evals](../test/ai-evals.md) requires of any model judge.
- The Anthropic judge of ADR 0049 stays limited to golden-set items.

## Consequences

- The change lands in phase 3 with its own requirement, tests, and configuration keys, which are added to [defaults](../architecture/defaults.md) in the pull request that first reads them. This ADR adds no requirement and changes no code.
- Judge results show a possible quality problem and are not ground truth. They carry the single-reviewer limit of ADR 0072 and ADR 0080.
- OQ-045 is answered and removed from [open questions](../open-questions.md).
