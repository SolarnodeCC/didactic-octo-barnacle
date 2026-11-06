---
title: "0048: OpenAlex publication types with an abstract"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-001, REQ-DATA-005, REQ-DATA-009]
---

# 0048: OpenAlex publication types with an abstract

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the OpenAlex request filter of [0041](0041-short-backfill-and-primary-topic-scope.md) and the [ingestion scope](../data-sources/ingestion-scope.md)

## Context

The first OpenAlex run on the configuration of ADR 0041 (6 November 2026) fetched 5,000 works, 4,980 of them new, and reached back only to publication date 3 November of its 14-day window. Measured on the OpenAlex API for publication dates 22 to 30 October 2026, with the filter of ADR 0041:

| Filter added | Works in 9 days | Per day |
|---|---|---|
| none | 106,113 | about 11,800 |
| `has_abstract:true` | 95,417 | about 10,600 |
| `type:article\|preprint` | 35,935 | about 4,000 |
| `type:article\|preprint\|review\|conference-paper` | 38,346 | about 4,300 |
| that type filter and `has_abstract:true` | 31,005 | about 3,400 |

58,081 of the 106,113 works (55%) are of type `dataset`. Triage reads the title and abstract (REQ-PROC-008), so a work without an abstract gives it nothing to judge.

The arXiv run of the same day needs no change: its 14-day window holds about 5,650 entries, so the next run continues at offset 5,000 and is expected to finish it.

## Options considered

1. **Only raise `ingestion.max_pages_per_run`.** Keeps datasets and works without an abstract, and about 11,800 works a day would later reach triage.
2. **Filter on publication types only.** About 4,300 a day; works without an abstract still stored as incomplete.
3. **Filter on publication types and on having an abstract.** About 3,400 a day. Chosen.

## Decision

- The OpenAlex request adds `type:article|preprint|review|conference-paper` and `has_abstract:true` (`OpenAlexScope.WorkTypes` and `OpenAlexScope.RequireAbstract` in `apps/pipeline/src/config.ts`). `type` joins the fields asked for with `select`.
- The collector checks both again on every returned work and skips, counts, and does not store a work of another type, without a type, or without an abstract, as it does for the topic check.
- `ingestion.max_pages_per_run` stays 50.

## Consequences

- OpenAlex works without an abstract are no longer fetched. REQ-DATA-005 AC2 still applies to every other missing field and to arXiv; an OpenAlex work can still be stored incomplete, for example without a publication date.
- At 50 pages a run fetches 5,000 works against about 3,400 new ones a day. The window that is open now holds about 30,000 works under this filter, so OpenAlex is expected to stay `partial` for two to three weeks before its first `succeeded` run. A higher page cap shortens that and stays a later option.
- The open OpenAlex chain keeps its cursor, a key on publication date and work ID, and continues under the new filter. If OpenAlex refuses that cursor, the page is dead-lettered and the next run starts a fresh window.
- The `OpenAlex scope lookup` workflow still counts by `topics.subfield.id` without the type filter; its counts remain an upper bound.
