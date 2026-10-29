---
title: Semantic Scholar
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-DATA-003]
---

# Semantic Scholar

Used for paper metadata, citation graphs, and its recommendation engine. Enrichment is planned for after the MVP (`Phase: later`, REQ-DATA-003).

## What we would use

| Feature | Used for |
|---|---|
| Lookup by external ID (DOI, arXiv ID) | Matching our publications |
| Citations and references | Citation graph (REQ-DATA-003) |
| Recommendations API | Related papers stored as links |
| TLDR summaries | Optional short summary in the dashboard |
| SPECTER2 embeddings | A candidate for the embedding model (OQ-005) |

## Verify before implementing

- API key requirements and rate limits.
- The API license agreement, in particular whether commercial use and storing results are allowed (OQ-014).
