---
title: "0100: Analysis rerun after the label review; the industry rules go into the prompts"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-TEST-005]
---

# 0100: Analysis rerun after the label review; the industry rules go into the prompts

- Decision status: Accepted
- Date: 2026-11-13
- Changes: the prompts `research-analyst@2` and `relevance@3`; the Rules of the [Research Analyst Agent](../agents/research-analyst.md) and the [Relevance Agent](../agents/relevance.md); the row of OQ-036 in [open questions](../open-questions.md). No requirement changes.

## Context

Research Analyst and Relevance ran again on 13 November 2026 on the labels of [ADR 0099](0099-research-analyst-and-relevance-label-review.md), with the prompts unchanged ([results](../test/analysis-benchmark-round-two-results.md)):

| Agent | Gemma, thinking off | DeepSeek | Run passes at |
|---|---|---|---|
| Research Analyst | 45.5 / 45.5 / 45.5 % | 69.7 / 69.7 / 63.6 % | 0.70 |
| Relevance | 45.5 / 45.5 / 45.5 % | 63.6 / 57.6 / 54.5 % | 0.80 |

No candidate passes. Two rules that the owner set, and that the labels now apply, are not in either prompt:

- Care providers and cross-industry software are `other` for Research Analyst (the golden-set README, confirmed in ADR 0099). `research-analyst@1` says only "use other only when none of the eight applies", and both candidates answer `life-sciences` for care providers.
- For Relevance, focus areas are read literally, a problem is within a focus area only when the customer is an organization of that industry, and a care provider or a cross-industry customer is at most indirect (ADR 0099). ADR 0099 wrote this into the Evals section of the Relevance Agent, not into its Rules, so `relevance@2` never states it; Gemma scores 80 to 100 on every entry of the indirect and outside bands.

## Options considered

1. **State the two rules in the prompts, worded as the owner set them, and change nothing else.** Chosen.
2. **Leave the prompts and record the round only.** The candidates would be measured against rules they are never told.
3. **Change more wording, for Novelty or effort.** Rejected: the owner kept the effort labels and the Novelty ranges (ADR 0099); further wording would tune the prompts to these answers.

## Decision

The owner chose, on 2026-11-13:

- **`research-analyst@2`** adds one line under Industry: "Care providers (hospitals, clinics, nurses, health systems) and software that serves organizations of every industry alike are other."
- **`relevance@3`** adds two lines after FocusMatch: the focus areas are read literally, and a problem lies within a focus area only when its words cover it and the customer is an organization of that industry; when the customer is a care provider or organizations of every industry alike, `IndustryFit` is at most 70 and `FocusMatch` at most `partial` for every industry. That is the indirect band of ADR 0099 (fit 45 to 70, raised by 5).
- Both rules move into the Rules of their agent documents. Nothing else in either prompt changes: the Novelty table, the maturity stages, the effort scale, and the output shape stay.
- Both agents run again from `main` once this is merged, with the same candidates, budgets, and thresholds.

## Consequences

- OQ-036 stays open for Research Analyst and Relevance until that run.
- Entry `gs-research-analyst-010` requires `life-sciences` for radiologists, who are care providers; ADR 0099 kept that label because radiology reporting is diagnostics. Under `research-analyst@2` a candidate that answers `other` alone fails it. The owner decides after the run whether the label or the rule gives way.
- Effort remains a large share of the Relevance failures, and six Novelty ranges remain above which at least two model families score; both stay as ADR 0099 decided.
- Round two cost EUR 0.43 (397 calls, USD 0.4821), the same as the gateway logs record.
