---
title: "0005: Derive score categories from agent output"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-SCORE-001, REQ-SCORE-003]
---

# 0005: Derive score categories from agent output

- Decision status: Accepted
- Date: 2026-10-29

## Context

The opportunity score is a weighted sum of five categories (REQ-SCORE-001), but no document said how each category value is computed. The scoring document asks for an ADR before the scoring engine is built.

## Options considered

1. **Ask a model for the five values directly.** Easy, but not explainable or reproducible, and it bypasses the agent contracts.
2. **Derive each value from typed agent fields with plain code.** Explainable, testable, and versioned; the agents still make the judgments, the code combines them.

## Decision

Option 2. Every category value is a number from 0 to 100, computed by plain code from the fields below (score model version 1). `lin(x, a, b)` maps x linearly from a..b to 0..100 and clamps to that range.

| Category | Rule |
|---|---|
| Scientific Novelty | Research Analyst `Novelty` |
| Market Potential | 0.6 × lin(log10(geometric mean of SAM `Low` and `High` in EUR), 6, 10) + 0.2 × lin(GrowthRate `CagrPercent`, 0, 30) + 0.2 × lin(Problem Discovery `PainLevel`, 1, 5) |
| Competitive Gap | 0.5 × lin(6 − Competition `Saturation`, 1, 5) + 0.5 × lin(Competition `GapStrength`, 1, 5) |
| Technical Feasibility | Relevance `TechnicalFeasibility` |
| Strategic Relevance | Relevance `StrategicRelevanceScore` |

- The market figure is the geometric mean of `Low` and `High`, because the range spans orders of magnitude. A SAM with an amount of zero or less cannot be scored; the opportunity is incomplete (REQ-SCORE-005).
- SAM figures in another currency are converted to EUR with a fixed, versioned rate table stored with the score model. A SAM geometric mean of EUR 1 million maps to 0 and EUR 10 billion maps to 100.
- Estimated market figures are not penalized in the arithmetic. While the market figures are estimates (`Basis: estimated`), the score carries the label `estimate-based` and the dashboard shows it (REQ-SCORE-004). A sourced figure removes the label. This avoids a uniform penalty that would only compress the range.
- Computation uses integer arithmetic in basis points (the weights are percentages), so rounding half up is exact and a weighted sum of 69.5 is 70.

## Consequences

- The constants are a first proposal and are tuned with the calibration set (REQ-SCORE-006). Every change creates a new score model version (REQ-SCORE-003).
- The explanation of a score lists the agent fields each rule read (REQ-SCORE-004).
- With the search tool of ADR 0013, sourced figures become possible and the `estimate-based` label is dropped per opportunity.
