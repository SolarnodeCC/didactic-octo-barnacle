---
title: Data requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Data requirements

The sources are described in [data sources](../data-sources/README.md) and the records in the [data model](../architecture/data-model.md).

## Ingestion

### REQ-DATA-001: OpenAlex ingestion

The research collector fetches works from OpenAlex, with their authors, institutions, topics, and citation counts.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: README roadmap phase 1 and Data Sources section
- Acceptance criteria:
  1. Works that match the configured ingestion scope (see [OpenAlex](../data-sources/openalex.md)) are fetched with their authors, institutions, topics, and citation counts.
  2. A repeated run does not create duplicate publications.
  3. A failed or rate-limited request is retried with exponential backoff up to the configured number of attempts; an item that still fails is recorded for the next run and does not stop the whole run.
  4. The abstract is reconstructed from `abstract_inverted_index` when OpenAlex provides one.
- Verification: integration test against recorded OpenAlex fixtures

### REQ-DATA-002: arXiv ingestion

The research collector fetches preprints from arXiv in the configured categories (see [arXiv](../data-sources/arxiv.md)).

- Phase: 1
- Priority: must
- Status: in-progress
- Source: README roadmap phase 1 and Data Sources section
- Acceptance criteria:
  1. Only preprints whose primary or cross-listed category is in the configured category list are fetched.
  2. A repeated run does not create duplicate preprints.
  3. A new version of a preprint updates the existing publication record and keeps the version number.
  4. Requests respect the arXiv API rate limit.
- Verification: integration test against recorded arXiv fixtures

### REQ-DATA-003: Semantic Scholar enrichment

Publications are enriched with Semantic Scholar paper metadata, citation graphs, and recommendations.

- Phase: later
- Priority: should
- Status: planned
- Source: README Data Sources section
- Acceptance criteria:
  1. A publication with a Semantic Scholar match, found by DOI or arXiv ID, has its citation graph stored.
  2. Related papers from the recommendation engine are stored as links between publications.
- Verification: integration test against recorded Semantic Scholar fixtures

### REQ-DATA-007: Cross-source deduplication

A publication found in more than one source has one publication record.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: KT review of data sources
- Depends on: REQ-DATA-001, REQ-DATA-002
- Acceptance criteria:
  1. Records are matched in this order: DOI, arXiv ID, then the IDs that OpenAlex lists for the work.
  2. Each source record is kept and linked to the publication record, so its origin stays traceable.
  3. Records that match only on normalized title and first author are flagged for review, not merged.
- Verification: unit tests on matching rules and integration test with overlapping fixtures

### REQ-DATA-009: Scheduled incremental ingestion

Ingestion runs on a schedule and fetches only what is new or changed since the last successful run.

- Phase: 1
- Priority: must
- Status: done
- Source: overview (continuous scanning)
- Depends on: REQ-DATA-001, REQ-DATA-002
- Acceptance criteria:
  1. Each source has a configured schedule and a stored cursor or date of its last successful run. Only a run that finished without failed items moves the cursor, so the next run covers the items that failed.
  2. A run fetches records published or updated after that cursor, with a configured overlap window.
  3. A first run backfills a configured window, for example the last 30 days.
  4. Every run stores its start, end, record counts, and failures.
- Verification: integration test that runs ingestion twice over fixtures

## Document processing

### REQ-DATA-004: PDF storage

The full-text PDF of an ingested publication is stored when it is openly available.

- Phase: 1
- Priority: must
- Status: done
- Source: README roadmap phase 1
- Acceptance criteria:
  1. A PDF is openly available when a source gives the URL of a PDF in the location whose license is recorded under REQ-DATA-010 and allows storage (ADR 0014). A separate open access URL does not qualify, because its license may differ. Most arXiv PDFs do not qualify, so those publications stay abstract-only.
  2. The PDF is stored once, keyed by its content hash, and linked to its publication record.
  3. A publication without an available PDF is still ingested and marked as having no PDF.
- Verification: integration test with local object storage

### REQ-DATA-005: Metadata extraction

Structured metadata from the source APIs is normalized into one publication record.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: README roadmap phase 1
- Acceptance criteria:
  1. Title, abstract, authors, publication date, source, and source identifier are stored for every publication.
  2. A publication missing a required field is stored, marked incomplete with the missing field, and not passed to the agents.
- Verification: unit tests on fixture documents

### REQ-DATA-006: Full-text extraction

Text is extracted from stored PDFs so agents can read more than the abstract.

- Phase: 2
- Priority: should
- Status: planned
- Source: KT review of agent inputs
- Depends on: REQ-DATA-004
- Acceptance criteria:
  1. Extracted text is stored with the extractor name and version.
  2. A PDF that cannot be parsed is marked as failed; the publication falls back to its abstract.
  3. Agents receive whether they read the full text or only the abstract. Abstract-only is the normal case for publications without a storable PDF (ADR 0014).
- Verification: unit tests on fixture PDFs with an open license

### REQ-DATA-008: Retractions and withdrawals

Retracted or withdrawn publications do not produce or keep active opportunities.

- Phase: 2
- Priority: should
- Status: planned
- Source: overview principle Reliability
- Acceptance criteria:
  1. A publication that OpenAlex marks as retracted, or that arXiv marks as withdrawn, is flagged on the next run.
  2. The opportunities of a flagged publication are hidden from ranking and marked with the reason. An opportunity has exactly one publication (ADR 0015).
  3. The vector of a flagged publication is removed (REQ-PROC-002).
- Verification: integration test with a retracted fixture record

### REQ-DATA-010: Content licensing

The platform records the license of each document and respects it.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: KT review of data sources
- Acceptance criteria:
  1. The license of each stored PDF and of each source's metadata is recorded.
  2. A PDF without a recorded license that allows storage is not stored.
  3. The dashboard links to the source of a document instead of serving the PDF, unless the license allows redistribution.
  4. The PDF URL comes from a source record and is fetched by the one PDF fetcher (ADR 0029): `https` on port 443 only, public host names only (no IP addresses, `localhost`, or internal names; an optional host list limits it further), each redirect checked again with at most 3, a size limit, one overall timeout, and a check of the content type and of the file's first bytes.
- Verification: unit tests on license rules and code review

### REQ-DATA-011: Idempotent queue processing

Every Queue consumer and Workflow step tolerates repeated delivery.

- Phase: 1
- Priority: must
- Status: planned
- Source: Readiness assessment; ADR 0004
- Depends on: REQ-DATA-009
- Acceptance criteria:
  1. A consumer checks stored state before it works, so processing the same message twice gives the same stored result.
  2. Queue messages are typed records with a schema version and carry IDs only, never large payloads.
  3. A message that fails its retries goes to a dead-letter queue, and the run report counts dead-lettered messages (REQ-NFR-008).
  4. A dead-lettered message can be replayed without creating duplicates. In phase 1 this is the replay function; the admin route `POST /admin/queue/replay` arrives with the admin API in phase 4 (REQ-ADM-004).
- Verification: integration test that delivers each message twice and replays a dead-lettered message
