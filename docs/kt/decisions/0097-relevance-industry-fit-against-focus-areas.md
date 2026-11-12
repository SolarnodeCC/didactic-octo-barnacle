---
title: "0097: Relevance scores IndustryFit against each industry's focus areas"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-12
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0097: Relevance scores IndustryFit against each industry's focus areas

- Decision status: Accepted
- Date: 2026-11-12
- Changes: the prompt `relevance@2` and the `IndustryFit` scale in [Relevance](../agents/relevance.md); supersedes the scale that [ADR 0093](0093-analysis-agents-benchmark.md) added. No requirement changes.

## Context

ADR 0093 gave `relevance@1` an `IndustryFit` scale the agent document did not have: 0 for no link, about 50 when an organization of the industry plausibly has the problem, 80 or more when the industry itself carries it. In round one ([ADR 0096](0096-analysis-round-one-results.md)) both candidates gave the best industry 85 to 100 for most entries, and the computed `StrategicRelevanceScore` fell outside the labelled range in 87 (Gemma) and 71 (DeepSeek) of 99 entry runs. The labels read strategic relevance as fit with the industry's focus areas: a problem the industry carries but outside its focus areas ranges from about 25 to 65, one within a focus area from about 60 to 100. The scale, not the candidates, caused most failures.

## Decision

`relevance@2` scores `IndustryFit` against each industry's focus areas, as the [overview](../overview.md) lists them:

| IndustryFit | Meaning |
|---|---|
| 0-20 | No link to the industry. |
| 20-45 | Organizations in the industry may have the problem, but it lies outside the industry's focus areas. |
| 45-70 | The problem touches one of the industry's focus areas indirectly. |
| 70-90 | The problem lies within one of the industry's focus areas. |
| 90-100 | The problem is central to a focus area and the industry itself carries it. |

`StrategicRelevanceScore` keeps its rule: the highest `IndustryFit`, raised by 5 for a `partial` and 10 for a `clear` `FocusMatch` of that industry, at most 100. Relevance runs again with both candidates, as in round one.

## Consequences

- The scale follows the intent of the labels, read from their notes, after round one showed the mismatch; the rerun may flatter the candidates for that reason, and the ADR that selects a model says so.
- Effort is the second cause of failures (33 and 34 of 99 entry runs) and is not changed here.
