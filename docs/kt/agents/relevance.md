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

- public sector, healthcare, financial services, and enterprise fit
- technical feasibility
- implementation effort

## Inputs

- Research Analyst output: industries, technologies, and maturity.
- Problem Discovery output.
- The target industries and focus areas from the [overview](../overview.md). An organization profile replaces them later (REQ-DASH-005).

## Output contract

```yaml
IndustryFit: map<enum [government, healthcare, financial-services, enterprise], integer 0..100>  # all four keys
StrategicRelevanceScore: integer 0..100     # evidence required
TechnicalFeasibility: integer 0..100        # evidence required
ImplementationEffort: enum [S, M, L, XL]
Constraints: list<string(max 200)> (0..5)   # for example regulation or data access
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

- StrategicRelevanceScore is the highest IndustryFit value, raised by up to 10 points when the opportunity matches a listed focus area of that industry, and capped at 100.
- TechnicalFeasibility starts from the research maturity: theoretical 0-29, lab result 30-59, prototype 60-79, field-tested 80-100. It is lowered for constraints such as missing data, regulation, or required hardware.

| ImplementationEffort | Meaning |
|---|---|
| S | A small team builds an MVP in under three months with existing tools. |
| M | An MVP takes three to six months or needs one specialist capability. |
| L | An MVP takes six to twelve months or needs regulated data or integrations. |
| XL | More than a year, new research, or certification is needed. |

## Evals

Golden set entries hold the expected best-fitting industry, acceptable ranges for StrategicRelevanceScore and TechnicalFeasibility, and the expected effort.
