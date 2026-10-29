---
title: Relevance Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-006]
---

# Relevance Agent

Requirement: REQ-AGENT-006. Feeds the Strategic Relevance and Technical Feasibility categories (see [scoring](../scoring.md)).

## Responsible for

- government, healthcare, financial services, and enterprise fit
- technical feasibility
- implementation effort

## Inputs

- Research Analyst output: industries, technologies, and maturity.
- Problem Discovery output.
- The target industries and focus areas from the [overview](../overview.md). An organization profile replaces them later (REQ-DASH-005).

## Output contract

```yaml
IndustryFit: map<enum [government, healthcare, financial-services, enterprise], integer 0..100>  # all four keys
StrategicRelevanceScore: integer 0..100     # computed by the pipeline from IndustryFit and the focus-area match; not written by the model
FocusMatch: map<enum [government, healthcare, financial-services, enterprise], enum [none, partial, clear]>  # all four keys
TechnicalFeasibility: integer 0..100        # model estimate; basis in Notes
ImplementationEffort: enum [S, M, L, XL]
Constraints: list<string(max 200)> (0..5)   # for example regulation or data access
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

- `StrategicRelevanceScore` is computed by plain code, not by the model: the highest `IndustryFit` value, raised by 5 points when that industry's `FocusMatch` is `partial` or by 10 points when it is `clear`, capped at 100. The model supplies `IndustryFit` and `FocusMatch`.
- TechnicalFeasibility is a model estimate; it has no evidence requirement because the agent does not receive publication text. It starts from the research maturity: theoretical 0-29, lab result 30-59, prototype 60-79, field-tested 80-100. It is lowered for constraints such as missing data, regulation, or required hardware.

| ImplementationEffort | Meaning |
|---|---|
| S | A small team builds an MVP in under three months with existing tools. |
| M | An MVP takes three to six months or needs one specialist capability. |
| L | An MVP takes six to twelve months or needs regulated data or integrations. |
| XL | More than a year, new research, or certification is needed. |

## Evals

Golden set entries hold the expected best-fitting industry, acceptable ranges for StrategicRelevanceScore and TechnicalFeasibility, and the expected effort.
