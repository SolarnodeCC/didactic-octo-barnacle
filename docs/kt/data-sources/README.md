---
title: Data sources index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Data sources

The platform uses three academic sources. CI never calls them; tests use recorded fixtures (see [test data](../test/test-data.md)).

- [OpenAlex](openalex.md): publications, authors, institutions, topics, and citations across all fields.
- [arXiv](arxiv.md): preprints in computer science categories.
- [Semantic Scholar](semantic-scholar.md): paper metadata, citation graphs, summaries, and recommendations.
- [Ingestion scope](ingestion-scope.md): the pilot categories, window, topic map, and daily limit.

## Comparison

| | OpenAlex | arXiv | Semantic Scholar |
|---|---|---|---|
| Role | Main source of publications | Early preprints in computer science | Enrichment of known publications |
| Coverage | All disciplines, including the management and health research behind many opportunities | Selected `cs` categories | Broad, strongest in computer science and biomedicine |
| Identifier | OpenAlex work ID, DOI | arXiv ID with version | Semantic Scholar paper ID, with external IDs |
| Abstract | Inverted index, sometimes missing | Always present | Usually present |
| Full text | Open access URL when known | PDF for every preprint | Open access PDF link when known |
| Metadata license | CC0 | CC0 for metadata; each paper has its own license | API license agreement |
| Phase | 1 | 1 | later |

Rate limits, authentication, and terms change over time. Each source document lists what to verify before implementing it.

## Identity across sources

One publication record per paper, matched by DOI, then arXiv ID, then the IDs OpenAlex lists for a work (REQ-DATA-007). See the [data model](../architecture/data-model.md).

## Precedence

When sources disagree on a field, use the value from the source closest to the publisher: OpenAlex for DOI, venue, and citation counts; arXiv for the preprint abstract, categories, and version; Semantic Scholar only for fields the others lack.
