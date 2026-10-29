---
title: Triage
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-PROC-005, REQ-PROC-006]
---

# Triage

Requirement: REQ-PROC-005 and REQ-PROC-006. A cheap filter before opportunity extraction. Rules run first; a small model scores what is left. It follows the [contract conventions](contract-conventions.md).

## Responsible for

- rejecting incomplete, retracted, out-of-scope, and already-processed publications with a recorded reason
- scoring the rest for likelihood of a software opportunity
- admitting at most the daily limit to extraction

It does not extract findings, size markets, or judge novelty.

## Inputs

- Publication title, abstract, publication date, source, topics.
- The topic map and the daily limit from [ingestion scope](../data-sources/ingestion-scope.md).

## Output contract

The model fills `TriageScore` and `Notes`; the pipeline fills the rest of the decision.

```yaml
Accepted: boolean                           # pipeline: score at the cut and within the daily limit
TriageScore: number 0..1                    # model
Reason: enum [accepted, incomplete, retracted, out-of-scope, low-score, daily-limit]
Notes: string(max 200)?
```

## Rules

- Rules decide `incomplete`, `retracted`, `out-of-scope` before any model call, so rejected publications cost nothing.
- Publications are ranked by `TriageScore`; those above the daily limit get `daily-limit` and are considered again the next day.
- Rejected publications stay searchable (REQ-PROC-005).

## Evals

The golden set holds at least 20 publications with expected accept or reject decisions, at least three that must be rejected as theory-only, and the expected `Reason` for rejected rules.
