---
title: Triage
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-PROC-005, REQ-PROC-006, REQ-PROC-008]
---

# Triage

Requirement: REQ-PROC-005, REQ-PROC-006, and REQ-PROC-008. A cheap filter before opportunity extraction. Rules run first, a small model reads five signals from what is left, and plain code decides (ADR 0036). It follows the [contract conventions](contract-conventions.md).

## Responsible for

- rejecting incomplete, retracted, and out-of-scope publications with a recorded reason (rules); a publication is triaged once, so a repeated message changes nothing (REQ-DATA-011)
- reading five signals from the title and abstract (model)
- accepting by a fixed rule and admitting at most the daily limit to extraction (code)

It does not extract findings, size markets, or judge novelty.

## Inputs

- Publication title, abstract, publication date, source, topics.
- The topic map and the daily limit from [ingestion scope](../data-sources/ingestion-scope.md).

## Output contract

The model fills `Signals` and `Notes`. The pipeline fills the rest of the decision.

```yaml
Signals:                                    # model
  NamedParty: boolean
  StatedHarm: boolean
  Trigger: boolean
  ExistingAlternative: boolean
  Adoptable: boolean
Notes: string(max 200)?                     # model: the deciding signals in one sentence
TriageScore: number 0..1                    # pipeline: true signals divided by five
Accepted: boolean                           # pipeline: the rule below
Reason: enum [accepted, incomplete, retracted, out-of-scope, low-score, daily-limit]  # pipeline
```

## Signals

The model judges from the title and abstract only.

| Signal | True when | Does not count |
|---|---|---|
| `NamedParty` | A role or organization type is named as having the problem, for example "governments", "regulatory bodies", or "clinicians". | A generic or implied party ("users", "people", "teams" without context), or the researchers themselves. |
| `StatedHarm` | The text states a cost, delay, loss, or risk that the party carries. A number is a plus and not required. | A quality gain of a method on a benchmark, or "hinders research". |
| `Trigger` | The text names why the problem is pressing now: a new regulation, a technology change, a changed budget or behavior. | "Growing interest" or "recent advances". |
| `ExistingAlternative` | The text names what the party does today instead: a tool, a manual process, or a practice. | Baselines that are only other research methods. |
| `Adoptable` | The work offers something an organization could adopt, such as a system, protocol, or tool. | Only knowledge, a proof, or a dataset or benchmark for research. A contribution that the text itself calls conceptual (a conceptual architecture, blueprint, or proposal) with nothing built or demonstrated. |

## Rules

- Rules decide `incomplete`, `retracted`, `out-of-scope` before any model call, so rejected publications cost nothing.
- Code sets `TriageScore` to the number of true signals divided by five.
- Code accepts a publication when `NamedParty` and `StatedHarm` are both true, `TriageScore` is at or above `triage.accept_score_cut` (default 0.55, so three of five signals), and the daily limit is not reached. A publication that fails the signal rule gets `Reason: low-score`.
- Accepted publications are ranked by `TriageScore`. Ties break by publication date (newest first), then by publication ID. Those above the daily limit get `daily-limit` and are considered again the next day.
- Rejected publications stay searchable (REQ-PROC-005).

## Prompt

`triage@1` in `packages/prompts/src/triage.ts` carries the signal table above, asks for `Signals` and `Notes` only, and puts the title and abstract inside `<publication>` delimiters (REQ-NFR-006). The output contract is strict, so a model that returns `TriageScore`, `Accepted`, or any other field fails validation (REQ-PROC-008 AC1).

## Evals

The golden set holds at least 20 publications. Each entry has the expected value of all five signals, and the decision follows from them by the same rule, so the labels can be checked for consistency.

- At least three entries are rejected as theory-only or research-only.
- At least three entries are rejected because `NamedParty` or `StatedHarm` is false although other signals are true.
- At least three entries pass triage.
- Rule rejections carry the expected `Reason`.

The eval reports agreement per signal, and the precision and recall of the accept decision.
