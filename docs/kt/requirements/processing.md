---
title: Processing requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Processing requirements

### REQ-PROC-001: Embeddings

Every ingested publication gets an embedding.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2
- Acceptance criteria:
  1. Each publication has exactly one current embedding, created with a recorded model version.
  2. Changing the embedding model re-embeds existing publications.
- Verification: integration test with a stubbed embedding model

### REQ-PROC-002: Vector database

Embeddings are stored in a vector database.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2 and Technology Stack (Cloudflare Vectorize)
- Acceptance criteria:
  1. Each vector is linked to its publication ID.
  2. Deleting a publication removes its vector.
- Verification: integration test with local bindings

### REQ-PROC-003: Semantic search

Users and agents can search publications by meaning.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2
- Acceptance criteria:
  1. A query returns publications ranked by similarity, with their scores.
  2. Results can be filtered by source and publication date.
- Verification: integration test on a fixture corpus with known nearest neighbors

### REQ-PROC-004: Opportunity extraction

Candidate opportunities are extracted from publications and passed to the agents.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2 and Core Workflow
- Acceptance criteria:
  1. Each candidate opportunity references the publication it came from.
  2. A publication can yield zero, one, or several candidates.
- Verification: eval on the golden set
