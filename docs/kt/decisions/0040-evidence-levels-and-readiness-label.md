---
title: "0040: Evidence levels and a readiness label next to the score"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-04
related: [REQ-AGENT-015, REQ-SCORE-008, REQ-SCORE-009, REQ-API-001, REQ-API-002, REQ-DASH-016]
---

# 0040: Evidence levels and a readiness label next to the score

- Decision status: Accepted
- Date: 2026-11-04

## Context

ADR 0036 chose option A for the MVP and designed option B for phase 3 (OQ-037): four evidence levels per element, a validation brief, and a readiness label. The design is in [evidence levels and readiness label](../evidence-and-readiness.md). It left four decisions to the owner. The owner answered them on 2026-11-04.

## Options considered

1. **Do not build option B.** The score stays the only signal. A reviewer cannot see which elements are still assumptions.
2. **Build option B as designed, with the four answers below.**

## Decision

Option B, with these answers:

1. **One analyst sets E3.** One entry by a named analyst is enough. A second analyst may confirm; the confirmation is a flag on the entry and does not change the level. Two required entries would be too slow for a small team.
2. **`validated` needs all four elements at E3.** A market at E2 does not suffice. `documented` is the intermediate step for four elements at E2 or higher.
3. **The Startup Generator writes the validation brief.** It already receives the Problem Discovery, Market Analysis, Competition, and Relevance outputs. A new step would add model cost and a golden set of its own.
4. **The label shows on the opportunity detail page only.** The API returns it on the detail endpoint and not on the list endpoint, so users do not read it as a ranking. The list, filters, sort orders, matrix, home, and search results do not use it.

Plain code derives levels and label. The model never sets a level, and the score weights stay as they are.

## Consequences

- REQ-AGENT-015 adds the brief to the Startup Generator contract (phase 3). REQ-SCORE-008 derives levels and label (phase 4). REQ-API-001, REQ-API-002, and REQ-DASH-016 fix where the label shows.
- Without analyst entries, no element reaches E3 and the best label is `documented`. The entry itself (REQ-SCORE-009) is phase `later`, because the data API has two writes in the MVP (ADR 0021). A third write needs a new ADR that supersedes ADR 0021 in that respect.
- The design draft's sentence that a reviewer can sort by the label is removed. Sorting needs the label in the list.
- The Startup Generator golden set gets a rubric for the kill question and the stop criterion. The expected level per element is added to the Problem Discovery, Market Analysis, and Competition entries (REQ-TEST-005).
- `validated` here is not the overview's "validated opportunity" (a score confirmed in a review). The glossary names both.
