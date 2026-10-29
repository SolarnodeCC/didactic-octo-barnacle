---
title: "0015: One candidate, one opportunity, one publication in the MVP"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DATA-008, REQ-API-002, REQ-SCORE-005]
---

# 0015: One candidate, one opportunity, one publication in the MVP

- Decision status: Accepted
- Date: 2026-10-29

## Context

The data model links one publication to many candidates and one candidate to one opportunity. Some requirements spoke of opportunities "based only on" a flagged publication and of several source publications. Several papers may also yield near-identical concepts.

## Options considered

1. **Strict 1:1 for the MVP.** Simplest schema and scoring. Duplicate concepts across papers show up as separate opportunities.
2. **A canonical opportunity grouping several candidates.** Better ranking quality, but needs a dedup step and a more complex score and review model.

## Decision

Option 1. An opportunity has exactly one candidate, and a candidate has exactly one publication. Related publications found by semantic search are listed as context (`RelatedPublicationIds`), not as sources of the opportunity. Grouping duplicates is later work.

## Consequences

- A retracted or withdrawn publication hides its opportunities (REQ-DATA-008).
- Deleting a publication deletes its candidates and opportunities.
- Near-duplicate opportunities are tolerated in the MVP. Opportunity-level dedup is added through a new ADR when the golden set shows it matters.
