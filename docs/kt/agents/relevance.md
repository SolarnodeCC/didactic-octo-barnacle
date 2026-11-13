---
title: Relevance Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-13
related: [REQ-AGENT-006]
---

# Relevance Agent

Requirement: REQ-AGENT-006. Feeds the Strategic Relevance and Technical Feasibility categories (see [scoring](../scoring.md)).

## Responsible for

- fit with each of the eight target industries
- technical feasibility
- implementation effort

## Inputs

- Research Analyst output: industries, technologies, and maturity.
- Problem Discovery output.
- The candidate from extraction: `Finding`, `Customer`, and, when set, `WhyNow` and `CurrentAlternative`, each with its quote (ADR 0070).
- The target industries and focus areas from the [overview](../overview.md). An organization profile replaces them later (REQ-DASH-005).

## Output contract

```yaml
IndustryFit: map<enum [automotive, aerospace-defense, consumer-retail, energy-utilities, banking, insurance, public-sector, life-sciences], integer 0..100>  # all eight keys; `other` has no score
StrategicRelevanceScore: integer 0..100     # computed by the pipeline from IndustryFit and the focus-area match; not written by the model
FocusMatch: map<enum [automotive, aerospace-defense, consumer-retail, energy-utilities, banking, insurance, public-sector, life-sciences], enum [none, partial, clear]>  # all eight keys
TechnicalFeasibility: integer 0..100        # model estimate; basis in Notes
ImplementationEffort: enum [S, M, L, XL]
Constraints: list<string(max 200)> (0..5)   # for example regulation or data access
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

- `StrategicRelevanceScore` is computed by plain code, not by the model: the highest `IndustryFit` value, raised by 5 points when that industry's `FocusMatch` is `partial` or by 10 points when it is `clear`, capped at 100. When several industries share the highest fit, the larger raise of them counts (ADR 0093). The model supplies `IndustryFit` and `FocusMatch`.
- `IndustryFit` is scored against each industry's focus areas: 0-20 no link, 20-45 the industry may have the problem but outside its focus areas, 45-70 a focus area is touched indirectly, 70-90 within a focus area, 90-100 central to a focus area and carried by the industry itself ([ADR 0097](../decisions/0097-relevance-industry-fit-against-focus-areas.md)).
- Focus areas are read literally, as written. A problem lies within a focus area only when the focus area's words cover it and the customer is an organization of that industry. When the customer is a care provider (hospital, clinic, nurses, health system) or organizations of every industry alike, `IndustryFit` is at most 70 and `FocusMatch` at most `partial` for every industry ([ADR 0099](../decisions/0099-research-analyst-and-relevance-label-review.md), [ADR 0100](../decisions/0100-analysis-rerun-and-industry-rules-in-the-prompts.md)).
- TechnicalFeasibility is a model estimate; it has no evidence requirement because the agent does not receive publication text. It may cite the candidate's quotes as `publication-quote` evidence (ADR 0070). It starts from the research maturity: theoretical 0-29, lab result 30-59, prototype 60-79, field-tested 80-100. It is lowered for constraints such as missing data, regulation, or required hardware.

ImplementationEffort counts three blockers that an MVP for the named customer cannot ship without ([ADR 0102](../decisions/0102-effort-counts-three-blockers.md)):

- **Live integration**: reading live from or writing into the customer's operational systems, such as SCADA, an EHR, core banking, an underwriting or pricing system, or a CI/CD pipeline. Reading public data, files the customer exports, or the research's released data is not live integration.
- **Regulated personal data**: patient health records, payment data, or customer financial records.
- **Domain experts**: only clinical, legal, actuarial, or regulatory specialists. Other domain or engineering expertise, machine learning, data science, and optimization do not count.

| ImplementationEffort | Meaning |
|---|---|
| S | None of the three blockers; existing tools; about under three months. |
| M | Exactly one blocker; about three to six months. |
| L | Two or more blockers; about six to twelve months. |
| XL | New research, or the product itself needs certification by law before first use, such as medical-device clearance, airworthiness, or security accreditation; software that supports regulated work does not. More than a year. |

The blocker count decides the level; the months only describe it.

## Evals

Golden set entries hold the expected best-fitting industry, acceptable ranges for StrategicRelevanceScore and TechnicalFeasibility, and the expected effort. The expected industry passes when it is among those with the highest `IndustryFit`. The StrategicRelevanceScore range follows one band against the best industry's focus areas, read literally: outside [20, 50], indirect [45, 75], within [75, 100]; within needs the customer to be an organization of that industry, so a care provider or a customer of every industry alike is at most indirect ([ADR 0099](../decisions/0099-research-analyst-and-relevance-label-review.md)).

## Prompt

`relevance@4` in `packages/prompts/src/relevance.ts` carries the rules above and the eight industries with their focus areas. It sends the candidate (`Finding`, `Customer`, and `WhyNow` and `CurrentAlternative` with their quotes when set), the Research Analyst maturity, industries, and technologies, and the Problem Discovery output, inside the `<publication>` delimiters; no publication text ([ADR 0093](../decisions/0093-analysis-agents-benchmark.md)).
