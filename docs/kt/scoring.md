---
title: Opportunity scoring
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-SCORE-001, REQ-SCORE-002]
---

# Opportunity scoring

Every opportunity receives a score from 0 to 100. The score is a weighted sum of five categories.

| Category | Weight |
|---|---|
| Scientific Novelty | 20% |
| Market Potential | 25% |
| Competitive Gap | 20% |
| Technical Feasibility | 15% |
| Strategic Relevance | 20% |

The final score maps to a band:

```text
0 - 39   Low
40 - 69  Medium
70 - 89  High
90 - 100 Exceptional
```

Requirements: REQ-SCORE-001 (weighted score) and REQ-SCORE-002 (bands). How each category is derived from agent output is not decided yet; record that as an ADR before implementing the scoring engine.
