---
title: OpenAlex
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
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

- Scope: works filtered by publication date and by topics that match the target industries (OQ-012).
- Incremental runs filter on publication date with an overlap window (REQ-DATA-009). Check which date filters the account tier supports; filters on update date may need a paid tier.
- Use cursor paging for large result sets.
- For a large backfill, consider the OpenAlex data snapshot instead of the API.

## Verify before implementing

- Current rate limits, daily limits, and whether an API key or a contact email is required.
- That the metadata license is still CC0.

## Credentials

Credentials, if any, live in the Cursor environment Secrets tab or GitHub Actions secrets. Record the secret name in [operations](../operations.md) when it is introduced.
