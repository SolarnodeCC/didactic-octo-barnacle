---
title: Market Analysis Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-003]
---

# Market Analysis Agent

Requirement: REQ-AGENT-003. Feeds the Market Potential category (see [scoring](../scoring.md)).

## Responsible for

- market sizing as TAM and SAM
- growth estimation
- naming the industry segment and geography the figures apply to

## Inputs

- Problem Discovery output.
- Research Analyst output: industries and technologies.
- The configured default currency and geography ([open questions](../open-questions.md), OQ-011).
- Results of the search tool (REQ-AGENT-013).

## Output contract

```yaml
TAM: MarketFigure                           # evidence required when Basis is sourced
SAM: MarketFigure                           # evidence required when Basis is sourced
GrowthRate:                                 # evidence required when Basis is sourced
  CagrPercent: number -50..100
  Period: string                            # for example "2026-2031"
  Basis: enum [sourced, estimated]
Method: enum [top-down, bottom-up]
Assumptions: list<string(max 200)> (1..5)
Confidence: number 0..1
Notes: string(max 400)?
```

`MarketFigure` is:

```yaml
Low: Money
High: Money                                 # High >= Low, same currency
Year: integer 2000..2100
Geography: string(max 60)                   # for example "EU" or "global"
Basis: enum [sourced, estimated]
```

## Rules

- SAM is not larger than TAM in the same currency and geography.
- Figures are ranges, never a single number. Without a source, `Basis` is `estimated` and confidence is at most 0.5.
- Models have a knowledge cutoff. The agent can use the search tool (ADR 0013, REQ-AGENT-013); a figure it cannot source stays `estimated`, and the dashboard labels it as such (REQ-DASH-001).

## Evals

Golden set entries hold acceptable order-of-magnitude ranges for SAM and growth, and the expected geography. An entry fails when the figures are off by more than one order of magnitude.
