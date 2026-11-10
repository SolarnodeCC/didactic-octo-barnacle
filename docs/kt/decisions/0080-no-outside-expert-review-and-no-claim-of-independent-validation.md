---
title: "0080: No outside expert review, and no claim of independent validation"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-TEST-005, REQ-TEST-006, REQ-SCORE-006]
---

# 0080: No outside expert review, and no claim of independent validation

- Decision status: Accepted
- Date: 2026-11-10
- Answers: OQ-044 (outside experts)
- Amends: the consequences of [0072](0072-one-owner-reviews-the-golden-sets-with-agents.md)

## Context

ADR 0072 has the owner review every golden-set entry and the calibration ranking, with agents to draft and cross-check. It names the limit: this shows consistency and owner review, not agreement with independent industry experts. It left open which outside experts close that gap before accuracy claims or launch (OQ-044), and it tied the evidence label `validated` to that check.

## Options considered

1. **Outside review at the launch checklist.** Name one or two experts then.
2. **Name experts now.**
3. **No outside review.** Chosen by the owner.

## Decision

- No outside expert review of the golden sets or the calibration set is planned.
- The product and its documents make no claim that scores, labels, or golden sets are validated against independent experts. Wherever accuracy is described, the document says that labels come from one reviewer, the owner, with agent help (ADR 0072).
- The evidence label `validated` of [0040](0040-evidence-levels-and-readiness-label.md) is unaffected. It states how well the evidence for one opportunity is backed (an analyst sets E3 for all four elements) and says nothing about the accuracy of the pipeline. The sentence of ADR 0072 that made it wait for an outside check does not apply.
- The decision is revisited if a customer or an advisor offers an expert review.

## Consequences

- OQ-044 (outside experts) is answered and removed from [open questions](../open-questions.md). The launch checklist has no expert-review item.
- Quality is shown by the golden-set thresholds, the owner's calibration ranking (REQ-SCORE-006), and the live run-signal monitor of [0071](0071-automatic-quality-monitoring-from-run-signals.md), each with the single-reviewer limit stated.
