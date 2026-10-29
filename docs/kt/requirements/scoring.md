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
  2. Each category value is a number from 0 to 100; the final score is the weighted sum rounded half up to an integer.
  3. The same category inputs always produce the same score.
  4. The stored score keeps the five category values and the score model version it was computed with.
- Verification: unit tests with fixed inputs

### REQ-SCORE-002: Score bands

Each score maps to a band: 0 to 39 Low, 40 to 69 Medium, 70 to 89 High, 90 to 100 Exceptional.

- Phase: 4
- Priority: must
- Status: planned
- Source: README Opportunity Scoring
- Acceptance criteria:
  1. The band is computed from the rounded integer score.
  2. The boundary values 39, 40, 69, 70, 89, and 90 map to the correct band, and a weighted sum of 69.5 maps to High.
  3. A score outside 0 to 100 is rejected.
- Verification: unit tests on boundary values

### REQ-SCORE-003: Category derivation

Each category value is derived from agent output with the versioned rules summarized in [scoring](../scoring.md). The proposed derivation formulas live in ADR 0005 until that ADR is accepted; after acceptance they become score model version 1.

- Phase: 4
- Priority: must
- Status: planned
- Source: scoring document and ADR 0005
- Depends on: REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-006
- Acceptance criteria:
  1. Every category has a derivation rule that names the agent fields it reads (ADR 0005 while Proposed; the accepted ADR thereafter).
  2. The derivation is plain code without model calls.
  3. Changing a rule or a weight creates a new score model version; stored scores keep their version.
- Verification: unit tests per category with fixed agent outputs

### REQ-SCORE-004: Score explanation

Every score can be explained category by category.

- Phase: 4
- Priority: must
- Status: planned
- Source: overview principle Reliability
- Acceptance criteria:
  1. Each category value is stored with the agent fields it was derived from and their evidence (REQ-AGENT-008).
  2. The explanation is available through the API and the dashboard (REQ-API-002, REQ-DASH-001).
- Verification: unit tests and end-to-end test

### REQ-SCORE-005: Incomplete inputs

An opportunity is only scored when all five categories can be derived.

- Phase: 4
- Priority: must
- Status: planned
- Source: KT review of scoring
- Acceptance criteria:
  1. An opportunity with a missing or failed category input gets no score and is marked incomplete with the missing category.
  2. Incomplete opportunities are excluded from ranking by default.
- Verification: unit tests

### REQ-SCORE-006: Score calibration

Scores agree with expert judgment on a reviewed set of opportunities.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of scoring
- Acceptance criteria:
  1. A calibration set of at least 30 opportunities is ranked by reviewers, and their ranking is stored with the set.
  2. The rank correlation between scores and the reviewers' ranking meets the threshold stored with the set.
  3. The band distribution of the calibration set is reported with each new score model version.
- Verification: eval on the calibration set

### REQ-SCORE-007: Score review

An analyst can confirm or dispute the score of an opportunity. The review is stored next to the score and never changes it.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of a comparable internal governance platform (indicative versus reviewed scores) and ADR 0007
- Depends on: REQ-SCORE-004, REQ-NFR-012
- Acceptance criteria:
  1. A score has a review state: `unreviewed` (the default), `confirmed`, or `disputed`.
  2. A review stores the user, the date, the state, and the ID of the score it applies to. A reason of at most 500 characters is required when disputing and optional when confirming.
  3. A review does not change the score, the band, the category values, or the position in a ranking.
  4. A new score from a rerun or a new score model version starts as `unreviewed`. Earlier reviews stay in the history of the opportunity and show the score model version they applied to.
  5. Reviews can be exported together with the score and its category values, for calibration (REQ-SCORE-006).
  6. A user with the viewer role cannot review (REQ-NFR-012).
- Verification: unit tests and integration test
