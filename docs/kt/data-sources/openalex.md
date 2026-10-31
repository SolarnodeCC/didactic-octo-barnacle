---
title: OpenAlex
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-31
related: [REQ-DATA-001, REQ-DATA-007, REQ-DATA-008, REQ-DATA-009]
---

# OpenAlex

Used for publications, authors, institutions, topics, and citations. OpenAlex is the main source because it covers all disciplines, not only computer science. Ingestion is a phase 1 deliverable (REQ-DATA-001).

## What we use

| Entity or field | Used for |
|---|---|
| Works: title, publication date, type, DOI, `ids` | Publication record and deduplication (REQ-DATA-007) |
| `abstract_inverted_index` | Abstract, reconstructed into text (REQ-DATA-001). Some works have none. |
| `authorships` with institutions | Authors and affiliations (REQ-NFR-009) |
| `topics` | Ingestion scope, triage, and topic trends (REQ-DASH-003) |
| `cited_by_count` | Citation count |
| `open_access` and locations | Open access URL and license for PDF storage (REQ-DATA-004, REQ-DATA-010) |
| `is_retracted` | Retraction flag (REQ-DATA-008) |

## Ingestion

- Scope: works filtered by publication date, by language (`language:en`), and by the topic map of the [ingestion scope](ingestion-scope.md). The request carries the configured subfield IDs as `topics.subfield.id:A|B|…` (at most 100 values). The collector also checks every returned work against the topic-map names and skips a work that matches none, so scope holds even when the ID list is empty or OpenAlex returns more than asked. Skipped works are counted in the run report.
- Incremental runs filter on publication date with an overlap window (REQ-DATA-009). Check which date filters the account tier supports; filters on update date may need a paid tier.
- Use cursor paging for large result sets. Cursor paging past the first page needs a free API key (ADR 0034).
- Use `per_page=100` and `select=` for only the fields above, so the daily budget goes further.
- Failed or rate-limited requests retry with exponential backoff (REQ-DATA-001).
- For a large backfill, consider the OpenAlex data snapshot instead of the API.

## Authentication

OpenAlex allows keyless basic queries. A free API key raises the daily budget about 10×, and is required for cursor paging past the first page. The collector therefore uses a free key in staging and production (ADR 0034).

How to get a key:

1. Create an account on openalex.org and copy the key from Settings → API key, or
2. Ask a coding agent to `POST https://api.openalex.org/api-keys` with the project owner's email; the owner clicks the emailed activation link.

Until the email is verified, requests with that key return 403 `key_not_activated`. An address that already has an account returns 409 `account_exists`; copy the key from Settings instead. Keep the key out of the repository.

Send the key as `Authorization: Bearer` (preferred) or as the `api_key` query parameter. Both work the same.

## Rate limits

| Caller | Requests per second |
|---|---|
| No API key | 10 |
| Free API key or prepaid usage | 30 |
| Annual plan | 50 |

A 429 is either the daily budget or the per-second limit. A per-second 429 costs nothing; wait and retry. Semantic search and filters with many boolean operators have lower limits of their own. Hard caps: 100 OR values per filter, `per_page` max 100, basic paging max 10,000 results (use cursor paging beyond that).

Response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Credits-Used`, and `X-RateLimit-Reset` show budget use; `GET /rate-limit` returns the same for a key.

## Verify before implementing

- That the metadata license is still CC0.
- That the date filters the pilot needs stay available on the free tier.

## Credentials

The collector reads `OPENALEX_API_KEY` from the Worker secret (ADR 0034). It lives in the Cursor environment Secrets tab, GitHub Actions secrets, or a Worker secret. The name is in [operations](../operations.md); never commit the value.
