---
title: Processing requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Processing requirements

### REQ-PROC-001: Embeddings

Every ingested publication gets an embedding of its title and abstract.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2
- Acceptance criteria:
  1. Each publication has exactly one current embedding of its title and abstract, created with a recorded model name and version.
  2. Changing the embedding model starts a backfill that re-embeds existing publications; search keeps using the old vectors until the backfill is complete.
  3. Embedding calls go through AI Gateway (REQ-NFR-003).
- Verification: integration test with a stubbed embedding model

### REQ-PROC-002: Vector database

Embeddings are stored in a vector database.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2 and Technology Stack (Cloudflare Vectorize)
- Acceptance criteria:
  1. Each vector is linked to its publication ID and carries the source and publication date as filterable metadata.
  2. Deleting a publication, or flagging it under REQ-DATA-008, removes its vector.
- Verification: integration test with local bindings

### REQ-PROC-003: Semantic search

Users and agents can search publications by meaning.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2
- Depends on: REQ-PROC-002
- Acceptance criteria:
  1. A query returns publications ranked by similarity, with their scores.
  2. Results can be filtered by source and publication date.
  3. On the fixture corpus, recall at 10 meets the threshold stored with the corpus.
- Verification: integration test on a fixture corpus with known nearest neighbors

### REQ-PROC-005: Triage before the agents

A cheap filter decides which publications go through the agent pipeline.

- Phase: 2
- Priority: must
- Status: planned
- Source: KT review of cost and volume (REQ-NFR-005)
- Depends on: REQ-DATA-005
- Acceptance criteria:
  1. Incomplete, retracted, or out-of-scope publications are rejected with a recorded reason.
  2. The remaining publications are ranked by a triage score, and at most the configured daily number goes to opportunity extraction.
  3. Rejected publications stay searchable.
- Verification: unit tests on triage rules and eval on the golden set

### REQ-PROC-004: Opportunity extraction

Candidate opportunities are extracted from triaged publications and passed to the agents.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2 and Core Workflow (Software Opportunity Discovery)
- Depends on: REQ-PROC-005
- Acceptance criteria:
  1. Each candidate opportunity references the publication it came from and holds a one-sentence finding with an evidence quote from that publication.
  2. A publication can yield zero, one, or at most the configured number of candidates.
  3. The extraction meets its eval threshold on the golden set, including papers that should yield no candidate.
- Verification: contract test and eval on the golden set
