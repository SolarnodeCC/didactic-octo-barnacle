---
title: Scoring requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Scoring requirements

The model is described in [scoring](../scoring.md).

### REQ-SCORE-001: Weighted opportunity score

The scoring engine computes a score from 0 to 100 as the weighted sum of Scientific Novelty (20%), Market Potential (25%), Competitive Gap (20%), Technical Feasibility (15%), and Strategic Relevance (20%).

- Phase: 4
- Priority: must
- Status: planned
- Source: README Opportunity Scoring
- Acceptance criteria:
  1. The weights sum to 100% and match the scoring document.
  2. The same category inputs always produce the same score.
  3. The stored score keeps the five category values it was computed from.
- Verification: unit tests with fixed inputs

### REQ-SCORE-002: Score bands

Each score maps to a band: 0 to 39 Low, 40 to 69 Medium, 70 to 89 High, 90 to 100 Exceptional.

- Phase: 4
- Priority: must
- Status: planned
- Source: README Opportunity Scoring
- Acceptance criteria:
  1. The boundary values 39, 40, 69, 70, 89, and 90 map to the correct band.
  2. A score outside 0 to 100 is rejected.
- Verification: unit tests on boundary values
