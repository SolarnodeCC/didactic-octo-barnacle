---
title: Evidence levels and readiness label
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-03
related: [REQ-PROC-009, REQ-AGENT-013, REQ-SCORE-004, REQ-SCORE-007, REQ-DASH-004]
---

# Evidence levels and readiness label

Design draft for option B of [ADR 0036](decisions/0036-observable-signals-for-triage-and-extraction.md) and open question OQ-037. It adds no requirement yet. When the owner approves it, requirement IDs are added in the same pull request that changes behavior, and the open question is removed.

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
- Both are written by a model and labeled as generated text with no evidence. They guide the reviewer and are not scored.

## Who enters E3

- An analyst enters validated evidence on the opportunity page: the element, a short description, a reference (a document, a note, a link), and the date. The record keeps the analyst's ID, like a score review (REQ-SCORE-007), and follows the same erasure rules.
- A second analyst may confirm. Whether one entry is enough is an open decision (see below).
- The entry never changes the score. It changes the level of the element.

## Readiness label

A readiness label sits next to the score. Plain code derives it from the five element levels, and the score weights stay as they are ([scoring](scoring.md)).

| Label | Rule |
|---|---|
| `unproven` | At least one of problem, customer, market, or reason to win is E0. |
| `assumed` | None is E0, and at least one of the four is E1. |
| `documented` | All four are E2 or higher. |
| `validated` | All four are E3. |

- Why now does not change the label. It shows as its own level.
- The label does not filter or rank. A reviewer can sort by it.
- The label is not the overview's term "validated opportunity" (an evidence-backed opportunity that an analyst confirmed in a score review). `validated` here means first-hand proof for all four elements.

## Evals

Golden-set entries for Problem Discovery, Market Analysis, and Competition would add the expected level per element, and the check is the share of entries where code derives the expected label. The kill question and the stop criterion are judged with a rubric, as free text.

## Decisions for the owner

1. Does one analyst entry set E3, or are two needed?
2. Is `validated` meant to require all four elements at E3, or may a market at E2 suffice?
3. Which agent writes the brief, a new step or the Startup Generator?
4. Should the label show in the API and the dashboard from the first phase-3 release, or only in the detail view?
