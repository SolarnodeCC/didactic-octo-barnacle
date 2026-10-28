---
title: "0005: Derive score categories from agent output"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-SCORE-001, REQ-SCORE-003]
---

# 0005: Derive score categories from agent output

- Decision status: Proposed
- Date: 2026-10-28

## Context

The opportunity score is a weighted sum of five categories (REQ-SCORE-001), but no document says how each category value is computed. The scoring document asks for an ADR before the scoring engine is built.

## Options considered

1. **Ask a model for the five values directly.** Easy, but not explainable or reproducible, and it bypasses the agent contracts.
2. **Derive each value from typed agent fields with plain code.** Explainable, testable, and versioned; the agents still make the judgments, the code combines them.

## Decision

Option 2, if accepted. Every category value is a number from 0 to 100, computed by plain code from the fields below (score model version 1). `lin(x, a, b)` maps x linearly from a..b to 0..100 and clamps to that range.

| Category | Rule |
|---|---|
| Scientific Novelty | Research Analyst `Novelty` |
| Market Potential | 0.6 × lin(log10(midpoint of SAM in EUR), 6, 10) + 0.2 × lin(GrowthRate `CagrPercent`, 0, 30) + 0.2 × lin(Problem Discovery `PainLevel`, 1, 5); multiplied by 0.8 when SAM `Basis` is `estimated` |
| Competitive Gap | 0.5 × lin(6 − Competition `Saturation`, 1, 5) + 0.5 × lin(Competition `GapStrength`, 1, 5) |
| Technical Feasibility | Relevance `TechnicalFeasibility` |
| Strategic Relevance | Relevance `StrategicRelevanceScore` |

SAM figures in another currency are converted to EUR with a fixed, versioned rate table. A SAM midpoint of EUR 1 million maps to 0 and EUR 10 billion maps to 100.

## Consequences

- The constants are a first proposal and are tuned with the calibration set (REQ-SCORE-006). Every change creates a new score model version (REQ-SCORE-003).
- Estimated market figures lower Market Potential, which rewards sourced figures once a market data source exists (OQ-007).
- The explanation of a score lists the agent fields each rule read (REQ-SCORE-004).
