---
title: "0112: The retraction check asks OpenAlex for retracted works and arXiv by stored ID"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-DATA-008, REQ-DATA-001, REQ-DATA-002]
---

# 0112: The retraction check asks OpenAlex for retracted works and arXiv by stored ID

- Decision status: Accepted
- Date: 2026-11-23
- Changes: how the weekly check of [ADR 0061](0061-retraction-check-looks-back-30-days.md) queries the sources ([phase 2 design](../phase-2/design.md#retractions))

## Context

ADR 0061 says the weekly check asks OpenAlex for retracted works, and arXiv for withdrawals, among the stored publications of the last 30 days. It does not say how. Read-only calls to OpenAlex on 2026-11-23 showed that its list endpoint leaves retracted works out unless the filter asks for them:

- `filter=ids.openalex:W4380078608` returned no work;
- `filter=ids.openalex:W4380078608,is_retracted:true` returned the work;
- `/works/W4380078608` returned `is_retracted: true`;
- `filter=is_retracted:true,from_publication_date:2023-06-09,to_publication_date:2023-06-09` returned 14 works, W4380078608 among them.

So daily ingestion, which lists works by date, seldom sees a retraction, and a lookup by ID without the filter misses it too. arXiv has no filter for withdrawn preprints. Ingestion reads a withdrawal from the comment or abstract.

## Options considered

1. **Re-ingest the 30-day window.** This pages and writes far more than the check needs, and still misses OpenAlex retractions.
2. **Look up every stored ID at both sources**, 50 IDs a request. For OpenAlex this means about 2,000 requests a week at the largest measured volume, and the lookup needs `is_retracted:true` anyway.
3. **Ask OpenAlex for the retracted works of the window, and arXiv by stored ID.** Chosen.

## Decision

- **OpenAlex.** The check asks for the works of the window with the ingestion scope (language, subfields, work types, abstract) and adds `is_retracted:true`, from the run day minus `retraction.lookback_days` to the run day. It pages by number (`page=1, 2, …`), so the queue message carries a page number only. Returned works whose short ID matches a stored `source_record` are flagged. Retractions within a window are few, so this is usually one request.
- **arXiv.** The check pages through the stored arXiv IDs of the window, 100 a request, with `id_list` and no category filter. It reads a withdrawal the same way ingestion does.
- **Pages.** Every page is a `retraction.check_page` message on the page queue, sent after the previous page, so the arXiv interval holds and no invocation runs long.
- **Run.** A run of kind `retraction-check` with the fixed ID `rc_<day>` counts what was seen and flagged per source, and is `succeeded` when both sources are done. A repeated trigger on the same day starts nothing.
- **What happens next.** The check only sets `publication.retracted`. The next daily sweep hides the candidates of each flagged publication (REQ-DATA-008 AC2).

## Consequences

- A stored arXiv preprint is looked up once a week while it is in the window: about one request per 100 stored preprints, three seconds apart.
- OpenAlex retractions are found by this check, not by ingestion. A work retracted more than 30 days after its publication date is still missed, as ADR 0061 accepts.
- The recorded page `apps/pipeline/src/fixtures/openalex/page-retracted.json` holds the `is_retracted:true` answer, trimmed to three works with W4380078608 first.
