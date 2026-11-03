---
title: "0038: Topic map for the eight target industries"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-03
related: [REQ-PROC-006, REQ-DATA-001, REQ-DATA-002]
---

# 0038: Topic map for the eight target industries

- Decision status: Accepted
- Date: 2026-11-03

## Context

[ADR 0037](0037-eight-target-industries.md) replaced the four pilot industries by eight and left the topic map of [ingestion scope](../data-sources/ingestion-scope.md) on the pilot rows until OQ-039 was answered. Automotive, Aerospace & Defense, Consumer Products & Retail, and Energy & Utilities had no mapping, so a publication from those fields was out of scope unless it also matched a pilot row. A check of the pilot names against the OpenAlex taxonomy also showed that several are not subfield names (`Software engineering`, `Public health`, `Clinical medicine`, `Political science`, `Radiology and imaging`, and `Organizational behavior`), so works with only those subfields never matched.

## Options considered

1. **Map each industry to OpenAlex fields (the 26 top-level fields).** Short, but a field such as Engineering or Medicine covers most of the corpus and scope would stop filtering.
2. **Map each industry to OpenAlex subfields and arXiv categories, plus a cross-industry row.** Narrower, uses names that exist in the taxonomy, and keeps the computing categories of the pilot.
3. **Map only the four missing industries and keep the four pilot rows.** Smallest change, but keeps the names that never match and the four rows that ADR 0037 retired.

## Decision

Option 2. The map in [ingestion scope](../data-sources/ingestion-scope.md#topic-map) has one row per target industry with OpenAlex subfield names and arXiv categories, and a cross-industry row for `Software`, `Human-Computer Interaction`, `cs.AI`, `cs.SE`, `cs.HC`, and `cs.CY`. The pipeline code mirrors it (`apps/pipeline/src/normalize/scope.ts`).

- A publication is in scope when one of its subfields or categories is in any row. The map does not assign an industry; Relevance does (REQ-AGENT-006).
- Subfield names are those the OpenAlex taxonomy returns, checked on 2026-11-03. Subfield IDs stay in configuration (`OpenAlexScope.SubfieldIds`) and are looked up with the manual scope-lookup workflow.
- A subfield or category may appear in several rows (for example `Finance` in Banking and Insurance, `eess.SY` in three rows).
- The map is a first proposal from the focus areas in the [overview](../overview.md#target-industries). It is reviewed with the phase 1 volume measurements before the first ingest beyond the pilot, and a change is a reviewed pull request that records the reason.

## Consequences

- The arXiv query grows from 4 to 24 categories, and the OpenAlex name check admits more subfields. Volume and cost per category are not measured; the daily limit to extraction (100) keeps the model cost bounded.
- The OpenAlex request still downloads works outside the map until the subfield IDs are filled in (see ingestion scope).
- Test fixtures use the real subfield names (`Software`, `Health Informatics`).
- A later change to the rows is a pull request; a change of the industry list is a new ADR.
