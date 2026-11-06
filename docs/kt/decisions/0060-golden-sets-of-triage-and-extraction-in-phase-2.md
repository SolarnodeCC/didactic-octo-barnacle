---
title: "0060: Golden sets of triage and extraction belong to phase 2"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-TEST-005, REQ-TEST-006, REQ-PROC-006, REQ-PROC-009]
---

# 0060: Golden sets of triage and extraction belong to phase 2

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-041
- Changes: REQ-TEST-005 (narrowed) and new REQ-TEST-006

## Context

REQ-TEST-005 required golden sets for every agent and model-backed step and was a phase 3 requirement. The phase 2 exit needs triage and extraction to meet their golden-set thresholds, and REQ-PROC-006 AC3 and REQ-PROC-009 AC5 depend on those sets. The sets, their threshold files, and `scripts/check-golden-sets.py` already exist.

## Options considered

1. **Split the requirement.** The triage and extraction part becomes a phase 2 requirement. Chosen.
2. **Move all of REQ-TEST-005 to phase 2**, which pulls the review of six unbuilt agents' sets, and OQ-015, into phase 2.
3. **Leave it in phase 3** and let the phase 2 exit depend on a phase 3 requirement.

## Decision

- REQ-TEST-006 (phase 2) carries the four criteria of REQ-TEST-005 for triage and extraction, including the three no-candidate entries of extraction.
- REQ-TEST-005 stays in phase 3 and covers the six analysis agents.
- The tests and documents that cover the triage and extraction sets name REQ-TEST-006. REQ-PROC-006 AC3, REQ-PROC-008 AC6, and REQ-PROC-009 AC5 point to it.
- The roadmap lists REQ-TEST-006 in phase 2.

## Consequences

- OQ-015 (named reviewers) still decides the reviewers of the industry sets before phase 3. For triage and extraction, the entries name the owner as reviewer, which the [model benchmark plan](../test/model-benchmark-plan.md) calls provisional.
- OQ-041 is answered and removed from [open questions](../open-questions.md).
