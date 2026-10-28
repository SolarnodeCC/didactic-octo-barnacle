---
title: Data requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Data requirements

## Ingestion

### REQ-DATA-001: OpenAlex ingestion

The research collector fetches publications from OpenAlex, with their authors, institutions, and citations.

- Phase: 1
- Priority: must
- Status: planned
- Source: README roadmap phase 1 and Data Sources section
- Acceptance criteria:
  1. Publications are fetched with their authors, institutions, and citation counts.
  2. A repeated run does not create duplicate publications.
  3. A failed or rate-limited request is retried and does not stop the whole run.
- Verification: integration test against recorded OpenAlex fixtures

### REQ-DATA-002: arXiv ingestion

The research collector fetches preprints from arXiv in Artificial Intelligence, Software Engineering, and Computer Science.

- Phase: 1
- Priority: must
- Status: planned
- Source: README roadmap phase 1 and Data Sources section
- Acceptance criteria:
  1. Only preprints in the configured categories are fetched.
  2. A repeated run does not create duplicate preprints.
  3. A preprint that is also found in OpenAlex is linked to the same publication record.
- Verification: integration test against recorded arXiv fixtures

### REQ-DATA-003: Semantic Scholar enrichment

Publications are enriched with Semantic Scholar paper metadata, citation graphs, and recommendations.

- Phase: later
- Priority: should
- Status: planned
- Source: README Data Sources section
- Acceptance criteria:
  1. A publication with a Semantic Scholar match has its citation graph stored.
  2. Related papers from the recommendation engine are stored as links between publications.
- Verification: integration test against recorded Semantic Scholar fixtures

## Document processing

### REQ-DATA-004: PDF storage

The full-text PDF of each ingested publication is stored when it is openly available.

- Phase: 1
- Priority: must
- Status: planned
- Source: README roadmap phase 1
- Acceptance criteria:
  1. The PDF is stored once per publication and linked to its record.
  2. A publication without an available PDF is still ingested and marked as having no PDF.
- Verification: integration test with local object storage

### REQ-DATA-005: Metadata extraction

Structured metadata is extracted from each publication.

- Phase: 1
- Priority: must
- Status: planned
- Source: README roadmap phase 1
- Acceptance criteria:
  1. Title, abstract, authors, publication date, source, and source identifier are stored for every publication.
  2. A publication missing a required field is reported and not passed to the agents.
- Verification: unit tests on fixture documents
