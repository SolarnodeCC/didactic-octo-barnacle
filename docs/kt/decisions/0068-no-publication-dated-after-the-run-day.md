---
title: "0068: No publication dated after the day of the run"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-DATA-001, REQ-DATA-009]
---

# 0068: No publication dated after the day of the run

- Decision status: Accepted
- Date: 2026-11-07
- Changes: REQ-DATA-009 (new AC7), the OpenAlex request, and the [OpenAlex](../data-sources/openalex.md) data source

## Context

The staging check of 7 November 2026 found 613 OpenAlex works with a publication date after that day, up to November 2027. OpenAlex lists works with a future publication date, for example for scheduled issues. The request sorts by publication date, newest first (ADR 0041), and sends no upper bound, so those works come before any real date: they took the first pages of the earlier windows and were stored. The arXiv request already ends on the day of the run (`SubmittedTo`). REQ-DATA-009 limited how old a publication may be, not how far in the future.

## Options considered

1. **Send an upper bound and check again in the collector.** The request carries `to_publication_date` set to the day of the run, and the collector skips and counts a work dated later, as it does for type, abstract, topic, and age. Chosen.
2. **Check in the collector only.** Future-dated works would still use the first pages of each window.
3. **Filter at read time.** Leaves the works in the database and moves the rule to every reader.

## Decision

- The OpenAlex request adds `to_publication_date:<day of the run>` (`OpenAlexPageRequest.ToDate`).
- `ingestOpenAlexWorks` skips and counts a work with a publication date after that day (`LatestDate`). A work without a date is kept and marked incomplete (REQ-DATA-005).
- REQ-DATA-009 AC7 states the rule for every source.

## Consequences

- A fresh window no longer spends its first pages on future-dated works.
- An open chain keeps its cursor and continues under the new filter. If OpenAlex refuses the cursor, the page is dead-lettered and the next run starts a fresh window, as in ADR 0048.
- The 613 works already stored stay in the staging database. Removing them needs the owner's decision, because it deletes publication, author, and source rows and their raw objects. Until then, readers that sort or window by date must not treat them as recent.
