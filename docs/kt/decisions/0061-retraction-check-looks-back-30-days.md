---
title: "0061: The weekly retraction check looks back 30 days"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-008]
---

# 0061: The weekly retraction check looks back 30 days

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-042
- Changes: the configuration key `retraction.lookback_days` of the [phase 2 schema](../phase-2/schema.md)

## Context

Ingestion re-reads only the last `ingestion.overlap_days` (2) days, so a retraction that comes later is found only by the weekly check of REQ-DATA-008. Nothing older than `ingestion.max_age_days` (90) is stored. The proposal was to look back the full 90 days.

## Options considered

1. **90 days.** Covers every stored publication.
2. **30 days.** Chosen by the owner.
3. **Every stored publication**, which grows with the corpus.

## Decision

`retraction.lookback_days` is 30. The weekly check asks OpenAlex for retracted works, and arXiv for withdrawals, among the stored publications of the last 30 days.

## Consequences

- A retraction that comes more than 30 days after the publication date is not found by the weekly check. A publication that is already an opportunity candidate is not covered after 30 days. Widen the key, with an ADR, if the first retractions show that this misses real cases.
- OQ-042 is answered and removed from [open questions](../open-questions.md).
