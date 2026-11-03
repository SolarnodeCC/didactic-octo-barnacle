---
title: "0037: Eight target industries"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-03
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-TEST-005, REQ-PROC-006]
---

# 0037: Eight target industries

- Decision status: Accepted
- Date: 2026-11-03

## Context

The documents named four target industries: government, healthcare, financial services, and enterprise. The owner wants the platform to focus on eight: Automotive; Aerospace & Defense; Consumer Products & Retail; Energy & Utilities; Banking (Finance); Insurance; Public Sector; and Life Sciences. The list appears in the overview, the agent contracts, the golden-set rules, and the example, and the interim topic map in ingestion scope mirrors it.

## Options considered

1. **Keep four industries and add the new ones as focus areas.** No migration, but the Relevance agent could not score fit per industry and the golden sets could not cover them.
2. **Replace the four by the eight and keep `other`.** Matches the owner's list. Care providers and cross-industry software fit none of the eight, so they need a value.
3. **Add Healthcare as a ninth industry.** Covers care providers, but departs from the list the owner named.

## Decision

Option 2. The industry values are `automotive`, `aerospace-defense`, `consumer-retail`, `energy-utilities`, `banking`, `insurance`, `public-sector`, and `life-sciences`, plus `other`.

- `other` stays the value for a publication or customer that fits none of the eight, as before. It has no entry in `IndustryFit` or `FocusMatch`.
- `IndustryFit` and `FocusMatch` hold all eight keys. `StrategicRelevanceScore` keeps its rule: the highest `IndustryFit`, raised by 5 for a partial and by 10 for a clear focus-area match.
- Life Sciences covers pharmaceutical, biotechnology, and medical-device topics. Care providers such as hospitals and nursing teams are `other` until the owner decides otherwise.
- The mapping of the old values is: government to `public-sector`; financial services to `banking` or `insurance` by case; healthcare to `life-sciences` or `other` by case; enterprise to a specific industry where the case has one, otherwise `other`.
- The focus areas per industry are in the [overview](../overview.md#target-industries).
- The golden-set reviewer slots become eight industry slots plus two shared slots (OQ-015).

## Consequences

- The topic map in [ingestion scope](../data-sources/ingestion-scope.md) and the pipeline code that mirrors it stay on the four-industry pilot map until OQ-039 is answered.
- Existing golden-set labels use the old values until they are relabeled in a follow-up pull request. Automotive, Aerospace & Defense, Consumer Products & Retail, and Energy & Utilities have no golden-set entries yet.
- A later change to the list is a new ADR.
