---
title: "0007: A score review annotates the score and never changes it"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-SCORE-001, REQ-SCORE-003, REQ-SCORE-006, REQ-SCORE-007, REQ-API-004]
---

# 0007: A score review annotates the score and never changes it

- Decision status: Accepted
- Date: 2026-10-29

## Context

Scores come from plain code over agent output (REQ-SCORE-003), and they are checked against expert judgment on a calibration set (REQ-SCORE-006). Analysts will sometimes disagree with a score. Governance tools in which people enter the scores let reviewers adjust them directly. Here the machine produces the scores, so an adjustment would mix two sources in one number.

## Options considered

1. **Override the final score.** An analyst types a number. Simple, but the score no longer follows from its inputs, calibration compares judgment with judgment, and the next rerun silently discards or conflicts with the override.
2. **Override a category value with a reason.** The arithmetic stays deterministic, but each stored score mixes machine and human inputs and needs its own explanation of which is which. Score model versions stop being comparable.
3. **Annotate.** An analyst confirms or disputes the current score and gives a reason. The score, band, and ranking do not change. Disputes become input for calibration and for the golden sets, and the root cause is fixed through a prompt or rule change with evals.

## Decision

Option 3. A review has a state (`confirmed` or `disputed`), a user, a date, and a reason, and applies to one score. A new score starts unreviewed. Revisit option 2 in a new ADR if calibration shows that analysts disagree systematically in one category.

## Consequences

- The data API has one write operation in the MVP (REQ-API-004), and user data is stored for reviews (REQ-NFR-009). Auth and admin writes are separate routes (ADR 0018).
- Reviews need roles, so REQ-NFR-012 belongs in phase 4 with the dashboard.
- Disputed scores are exported for calibration (REQ-SCORE-006) and are candidates for golden set entries, like the "bad output reached the dashboard" case in [operations](../operations.md).
- The ranking never depends on a person, so two analysts cannot produce two rankings.
