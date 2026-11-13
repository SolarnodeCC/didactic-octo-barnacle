---
title: "0105: Relevance threshold aligned with the other analysis agents"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0105: Relevance threshold aligned with the other analysis agents

- Decision status: Accepted
- Date: 2026-11-13
- Changes: `agents/analysis/evals/relevance.threshold.json` (minimum 0.85 to 0.75, tolerance 0.05 unchanged); the Relevance threshold that [ADR 0093](0093-analysis-agents-benchmark.md) set. No requirement changes.

## Context

[ADR 0093](0093-analysis-agents-benchmark.md) set the analysis thresholds before the first run: 0.75 for Research Analyst and Problem Discovery, 0.85 for Relevance, each with a tolerance of 0.05, so a Relevance run must reach 0.80. [AI evals](../test/ai-evals.md) allows one review of a threshold with data after the first runs, through a reviewed pull request (REQ-TEST-005, criterion 4). This is that review.

Four rounds and four label or prompt reviews ([ADR 0099](0099-research-analyst-and-relevance-label-review.md) to [ADR 0104](0104-care-provider-limit-is-a-ceiling.md)) showed that Relevance carries more judgement than the other two agents, not less:

- Its labels needed the most review: strategic-relevance bands, the care-provider rules, an effort scale rewritten twice.
- Two careful readers applying the same written effort rule agreed on 19 of 33 entries (ADR 0102); the eval now accepts effort within one level (ADR 0103).
- Strategic relevance rests on reading broad focus areas such as "Public services" or "Risk management", which the owner and the blind cross-checks have read differently on several entries.

A stricter bar for the most judgement-laden agent is hard to defend. Relevance also decides less on its own: its output feeds two categories of the opportunity score, Strategic Relevance and Technical Feasibility ([scoring](../scoring.md)), next to the categories of the other agents.

## Options considered

1. **Align Relevance with Research Analyst and Problem Discovery: minimum 0.75.** Chosen.
2. **Keep 0.85.** It assumes a precision the labels themselves do not have.
3. **Lower it further.** No reason beyond the results; rejected.

## Decision

The owner chose, on 2026-11-13:

- The Relevance threshold becomes minimum 0.75 with a tolerance of 0.05, the same as the other analysis agents; every run must still reach 0.70.
- The change is decided before the run on `relevance@5` (ADR 0104) and is not applied to earlier rounds as a selection.

## Consequences

- The next Relevance run is scored at 0.70 per run. A candidate chosen on it is recorded in its own ADR, as every model choice is.
- Scored at 0.70, round four would have passed Gemma (72.7 / 72.7 / 75.8 %) and not DeepSeek (81.8 / 69.7 / 75.8 %). That is noted here for completeness; the choice rests on the run that follows this decision.
- The threshold is not reviewed again with data; a later change needs a product reason and a larger golden set ([AI evals](../test/ai-evals.md)).
