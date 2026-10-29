---
title: Competition Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-004]
---

# Competition Agent

Requirement: REQ-AGENT-004. Feeds the Competitive Gap category (see [scoring](../scoring.md)).

## Responsible for

- competitor discovery
- market saturation scoring
- gap and differentiation analysis

## Inputs

- Problem Discovery output.
- Research Analyst output: technologies.
- Results of a competitor search tool, when one is connected (OQ-008).

## Output contract

```yaml
Competitors: list<Competitor> (0..10)
Saturation: integer 1..5
Gap: string(max 400)                        # evidence required
GapStrength: integer 1..5
Differentiation: string(max 400)
Confidence: number 0..1
Notes: string(max 400)?
```

`Competitor` is:

```yaml
Name: string(max 80)
Url: string?
Kind: enum [direct, indirect, substitute]
Description: string(max 200)
Verified: boolean                           # true only when found by the search tool
```

## Rules

| Value | Saturation | GapStrength |
|---|---|---|
| 1 | No known solutions. | The gap is marginal; existing tools nearly cover it. |
| 2 | A few niche solutions. | A small feature gap. |
| 3 | Several established solutions. | A clear gap for one segment. |
| 4 | Many solutions, some dominant. | A clear gap for several segments. |
| 5 | Crowded market with dominant players. | No existing solution addresses the problem. |

- `GapStrength` 5 is only valid when `Competitors` has no `Kind: direct` entry. A listed direct competitor means at least one existing solution addresses the problem, so `GapStrength` is at most 4.
- Without a search tool, competitors come from model knowledge and have `Verified: false`.
- An empty competitor list needs a note that explains why none were found.

## Evals

Golden set entries hold competitors that must be found, an acceptable Saturation range, and the required facts of the gap.
