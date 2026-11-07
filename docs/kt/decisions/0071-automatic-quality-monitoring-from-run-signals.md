---
title: "0071: Automatic quality monitoring from run signals"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-NFR-023, REQ-NFR-008, REQ-NFR-019, REQ-TEST-007, REQ-PROC-008, REQ-PROC-009]
---

# 0071: Automatic quality monitoring from run signals

- Decision status: Proposed
- Date: 2026-11-07
- Answers: none
- Changes: new REQ-NFR-023; REQ-NFR-019 AC1 (the `quality-drift` alert); new OQ-044 in [open questions](../open-questions.md); WP9 of the phase 2 [build plan](../phase-2/build-plan.md)

## Context

The evals check triage and extraction on golden sets before a prompt or model change merges (REQ-TEST-004, ADR 0067). Nothing checks the live output afterwards. With no person reviewing pipeline output, a change in what the sources publish, a provider-side change to a pinned model, or a slow drift toward paraphrased quotes would go unnoticed until someone reads the dashboard.

The 2026-11-07 review of the agent chain considered a model judge on a sample of live output. [ADR 0049](0049-workers-ai-for-pipeline-anthropic-for-judge.md) allows the Anthropic judge only on golden-set items, although gate question 4 of the [review brief](../legal/review-brief.md), approved on 2026-11-06, permits sending abstracts to it. A judge call per sampled item also has no line in the budget of [0059](0059-phase-2-budget-by-cost-component.md). The pipeline already records what it needs for a cheaper check: every model call has a `model_call` row (REQ-NFR-011), every decision is stored, and every run has a report (REQ-NFR-008).

## Options considered

1. **Monitor distributions from stored run data, compare them with a rolling baseline, and alert on drift.** Chosen. It needs no extra model call.
2. **A production model judge on a daily sample.** Deferred to OQ-044: it needs a change to ADR 0049 and a budget line.
3. **Rely on the nightly golden-set eval.** Rejected as the only check: it tests a fixed set, not what the sources send today.

## Decision

- **Daily quality section.** The daily processing run report gains a quality section, computed from stored rows only:
  - triage: accept rate, and the share of publications with each signal true;
  - extraction: share of empty results, candidates per publication, and the share of input that was abstract-only;
  - model calls per step: first-attempt validity, repair rate, quote-failure rate, and dropped candidates (ADR 0064);
  - the report-only code checks of [0066](0066-code-checks-before-model-judgement.md);
  - the `Confidence` histogram of extraction, and counts per industry;
  - where accepted quotes fall in the input text, by tenth of its length (ADR 0065);
  - agreement between triage and extraction: the share of accepted publications with no candidate, and how often a true `Trigger` or `ExistingAlternative` signal comes with a quoted `WhyNow` or `CurrentAlternative`;
  - possible near-duplicate opportunities: candidates whose publications are nearest neighbours at a cosine of at least `monitor.near_duplicate_cosine` (0.92) in the current embedding index and that share a normalised `Customer`. This reuses the publication vectors and needs no new embedding. It is counted only; [0015](0015-one-candidate-one-opportunity.md) does not change.
- **Baseline and drift.** Each rate is compared with its median over the previous `monitor.baseline_days` (14) days. A rate that moves more than `monitor.drift_band` (0.5, as a relative change) away from its median, on a day with at least `monitor.min_daily_items` (20) items behind it, is a drift.
- **Alert.** A drift raises one `quality-drift` alert per metric and day (REQ-NFR-019), with the metric, the value, and the baseline. Repeats within 24 hours comment on the open issue, as for every alert.
- **Start-up.** For the first `monitor.baseline_days` days after processing starts, the section is reported without alerts.
- **Production judge.** Not added. OQ-044 asks whether a separate Workers AI model, which keeps the data with Cloudflare, should judge a daily sample.

## Consequences

- A drop in quote validity, a jump in empty extractions, or a shift in industries is visible the next day and alerts without anyone reading the report.
- The section adds D1 queries to the daily report and no model call.
- The bands are first guesses; they are tuned from the first weeks of data by reviewed pull request, like other configuration.
