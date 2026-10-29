---
title: Research Analyst Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-001]
---

# Research Analyst Agent

Requirement: REQ-AGENT-001. Feeds the Scientific Novelty category (see [scoring](../scoring.md)).

## Responsible for

- understanding what the publication found and how mature the result is
- judging novelty against related publications in the corpus
- naming the industries and technologies involved

Trend discovery across many publications is not part of this agent; it is part of the dashboard (REQ-DASH-003).

## Inputs

- Publication metadata: title, abstract, publication date, source, topics, citation count.
- Full text when available (REQ-DATA-006).
- The candidate opportunity from extraction (REQ-PROC-004).
- The ten nearest publications from semantic search (REQ-PROC-003): title, abstract, and date.

## Output contract

```yaml
Novelty: integer 0..100                      # evidence required
NoveltyRationale: string(max 600)
RelatedPublicationIds: list<string> (0..10)  # publications compared against
Maturity: enum [theoretical, lab-result, prototype, field-tested]
Industry: list<Industry> (1..4)              # most relevant first
Technology: list<string(max 60)> (1..5)
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

| Novelty | Meaning |
|---|---|
| 0-19 | Repeats known results; the nearest publications report the same finding. |
| 20-49 | Incremental: a known method applied to a new setting or with better numbers. |
| 50-79 | A new method or a clearly new finding for this field. |
| 80-100 | A new direction with few or no comparable publications. |

- Novelty evidence cites at least one related publication, or is a `none-found` item stating that none were found.
- Industry uses `other` only when none of the four target industries applies.

## Evals

Golden set entries hold an expected Novelty range, the expected Maturity, and the industries that must be included.
