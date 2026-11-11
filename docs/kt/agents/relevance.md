---
title: Relevance Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-11
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
- `IndustryFit` is 0 when the problem has no link to the industry, around 50 when an organization in it plausibly has the problem, and 80 or more when the industry itself carries the problem (ADR 0093).
- TechnicalFeasibility is a model estimate; it has no evidence requirement because the agent does not receive publication text. It may cite the candidate's quotes as `publication-quote` evidence (ADR 0070). It starts from the research maturity: theoretical 0-29, lab result 30-59, prototype 60-79, field-tested 80-100. It is lowered for constraints such as missing data, regulation, or required hardware.

| ImplementationEffort | Meaning |
|---|---|
| S | A small team builds an MVP in under three months with existing tools. |
| M | An MVP takes three to six months or needs one specialist capability. |
| L | An MVP takes six to twelve months or needs regulated data or integrations. |
| XL | More than a year, new research, or certification is needed. |

## Evals

Golden set entries hold the expected best-fitting industry, acceptable ranges for StrategicRelevanceScore and TechnicalFeasibility, and the expected effort. The expected industry passes when it is among those with the highest `IndustryFit`.

## Prompt

`relevance@1` in `packages/prompts/src/relevance.ts` carries the rules above and the eight industries with their focus areas. It sends the candidate (`Finding`, `Customer`, and `WhyNow` and `CurrentAlternative` with their quotes when set), the Research Analyst maturity, industries, and technologies, and the Problem Discovery output, inside the `<publication>` delimiters; no publication text ([ADR 0093](../decisions/0093-analysis-agents-benchmark.md)).
