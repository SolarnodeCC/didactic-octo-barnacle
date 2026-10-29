---
title: Opportunity scoring
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-SCORE-001, REQ-SCORE-002, REQ-SCORE-003, REQ-SCORE-004, REQ-SCORE-005, REQ-SCORE-006, REQ-SCORE-007]
---

# Opportunity scoring

Every complete opportunity receives a score from 0 to 100. The score is a weighted sum of five categories.

| Category | Weight | Question it answers | Derived from |
|---|---|---|---|
| Scientific Novelty | 20% | How new is the research result? | [Research Analyst](agents/research-analyst.md) |
| Market Potential | 25% | How large, growing, and painful is the market? | [Market Analysis](agents/market-analysis.md), [Problem Discovery](agents/problem-discovery.md) |
| Competitive Gap | 20% | How open is the market? | [Competition](agents/competition.md) |
| Technical Feasibility | 15% | Can it be built with today's technology? | [Relevance](agents/relevance.md) |
| Strategic Relevance | 20% | How well does it fit the target industries? | [Relevance](agents/relevance.md) |

The final score maps to a band:

```text
0 - 39   Low
40 - 69  Medium
70 - 89  High
90 - 100 Exceptional
```

## Computation

1. Each category value is a number from 0 to 100, derived from agent fields by plain code (REQ-SCORE-003). The rules are in ADR 0005.
2. The final score is the weighted sum, computed in integer arithmetic and rounded half up to an integer (REQ-SCORE-001). A weighted sum of 69.5 becomes 70 and lands in High.
3. The band is computed from the rounded score (REQ-SCORE-002).
4. When a category cannot be derived, the opportunity gets no score and is marked incomplete (REQ-SCORE-005). Missing categories are never filled with a default.

## Explanation

Each category value is stored with the agent fields it was read from and their evidence, so the dashboard can show why an opportunity scored as it did (REQ-SCORE-004). Market figures that are estimates and competitors that were not verified are labeled. While the market figures used are estimates, the score carries the label `estimate-based` (ADR 0005, REQ-SCORE-004); a sourced figure (REQ-AGENT-013) removes it.

## Versioning

The weights and derivation rules together form a score model version. A change to either creates a new version; stored scores keep the version they were computed with, and scores from different versions are not mixed in one ranking. Lists and rankings use the active score model version set by an admin; a rescore (REQ-ADM-003) computes new scores from stored agent outputs without a model call.

## Review

An analyst can confirm or dispute the current score and give a reason (REQ-SCORE-007). A review is stored next to the score and never changes the score, the band, or the ranking (ADR 0007). A new score from a rerun or a new score model version starts as unreviewed. Disputed scores feed calibration.

## Calibration

Scores are checked against expert judgment on a calibration set of at least 60 opportunities (REQ-SCORE-006). The calibration report shows the rank correlation with its 95 % confidence interval and the band distribution. Most opportunities are expected in Low and Medium; if many land in Exceptional, the rules are too generous.
