---
title: Evidence levels and readiness label
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-04
related: [REQ-PROC-009, REQ-AGENT-013, REQ-AGENT-015, REQ-SCORE-004, REQ-SCORE-007, REQ-SCORE-008, REQ-SCORE-009, REQ-DASH-016]
---

# Evidence levels and readiness label

Design for option B of [ADR 0036](decisions/0036-observable-signals-for-triage-and-extraction.md). The owner answered the four open decisions on 2026-11-04 ([ADR 0040](decisions/0040-evidence-levels-and-readiness-label.md)). The requirements are REQ-AGENT-015, REQ-SCORE-008, REQ-SCORE-009, and REQ-DASH-016.

## Purpose

The owner's framework names four elements of an opportunity: an urgent problem, a paying customer, a reachable market, and a reason to win. It adds a why-now test. A publication can show the problem and the customer, and often a market figure. It cannot hold interviews, letters of intent, or named target customers, which the framework asks for as proof. This design records how much proof each element has, so a reviewer sees what is still an assumption, without turning the missing proof into a gate (customer validation, pricing, and contracts are non-goals of the MVP, see the [overview](overview.md)).

## Evidence levels

Each element of a candidate has one level.

| Level | Name | Meaning | Who can set it |
|---|---|---|---|
| E0 | Absent | Nothing in the pipeline output addresses the element. | Code |
| E1 | Assumption | The element is stated by a model or estimated, with no source. | Code, from the agent output |
| E2 | Documentary evidence | A quote from the publication or a cited external source supports it (an `external-url` evidence item, REQ-AGENT-013). | Code, from verified evidence |
| E3 | Validated by a person | A named analyst records interviews, a letter of intent, named target customers, or a comparable first-hand source. | An analyst only |

## Elements

| Element | Source of E2 | Typical level from the pipeline |
|---|---|---|
| Problem | `EvidenceQuote` of the extraction candidate | E2 |
| Customer | `CustomerQuote` of the extraction candidate | E2 |
| Market | Sourced market figures of Market Analysis (`Basis: sourced`) | E1 or E2 |
| Reason to win | Verified competitors of Competition (`Verified: true`) plus the differentiation of the concept | E1 |
| Why now | `WhyNowQuote`, or a sourced trend | E0 to E2 |

The pipeline never sets E3. A candidate with `WhyNow` empty has E0 for that element, and the step never infers it (REQ-PROC-009).

## Validation brief

For each opportunity, a brief lists per element its level, its evidence items (publication quote, search result, or analyst entry), a **kill question**, and a **stop criterion**.

- The kill question is the single question whose answer would show the element false, for example "Does a named buyer at a bank budget for this fraud workflow?".
- The stop criterion states when to drop the opportunity, for example "Stop if five of ten interviewed compliance leads already use a tool that covers the case".
- The Startup Generator writes both as part of its output (REQ-AGENT-015); there is no separate step. They are labeled as generated text with no evidence. They guide the reviewer and are not scored.

## Who enters E3

- An analyst enters validated evidence on the opportunity page: the element, a short description, a reference (a document, a note, a link), and the date. The record keeps the analyst's ID, like a score review (REQ-SCORE-007), and follows the same erasure rules.
- One entry by one analyst sets E3. A second analyst may confirm; the confirmation is a flag and does not change the level (ADR 0040).
- The entry route is a third write of the data API, so REQ-SCORE-009 is phase `later` and needs an ADR that supersedes ADR 0021 in that respect. Until then the pipeline gives at most `documented`.
- The entry never changes the score. It changes the level of the element.

## Readiness label

A readiness label sits next to the score. Plain code derives it from the five element levels, and the score weights stay as they are ([scoring](scoring.md)).

| Label | Rule |
|---|---|
| `unproven` | At least one of problem, customer, market, or reason to win is E0. |
| `assumed` | None is E0, and at least one of the four is E1. |
| `documented` | All four are E2 or higher. |
| `validated` | All four are E3. A market at E2 does not suffice. |

- Why now does not change the label. It shows as its own level.
- The label does not filter, sort, or rank, and it shows on the opportunity detail page only. The API returns it on the detail endpoint and not in lists (REQ-API-001, REQ-API-002, REQ-DASH-016).
- The label is not the overview's term "validated opportunity" (an evidence-backed opportunity that an analyst confirmed in a score review). `validated` here means first-hand proof for all four elements.

## Evals

Golden-set entries for Problem Discovery, Market Analysis, and Competition add the expected level per element, and the check is the share of entries where code derives the expected label. The kill question and the stop criterion are judged with a rubric in the Startup Generator golden set, as free text (REQ-AGENT-015).

## Decisions

The owner answered these on 2026-11-04 (ADR 0040):

1. One analyst entry sets E3. A second analyst may confirm.
2. `validated` requires all four elements at E3. `documented` is the intermediate step.
3. The Startup Generator writes the brief. No new step.
4. The label shows on the detail page only, not in the list.
