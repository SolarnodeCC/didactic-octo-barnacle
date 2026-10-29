---
title: Processing requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
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

Agents and the dashboard can search publications by meaning.

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2
- Depends on: REQ-PROC-002
- Acceptance criteria:
  1. A query returns publications ranked by similarity, with their scores.
  2. Results can be filtered by source and publication date.
  3. On the fixture corpus, recall at 10 meets the threshold stored with the corpus.
  4. The search is exposed to users through the opportunity search of REQ-API-006 and REQ-DASH-015, and is available to agents inside the pipeline.
- Verification: integration test on a fixture corpus with known nearest neighbors

### REQ-PROC-005: Triage before the agents

A cheap filter decides which publications go to opportunity extraction and, later, the agent pipeline.

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

Candidate opportunities are extracted from triaged publications and passed to the agents. The output contract is in [opportunity extraction](../agents/opportunity-extraction.md).

- Phase: 2
- Priority: must
- Status: planned
- Source: README roadmap phase 2 and Core Workflow (Software Opportunity Discovery)
- Depends on: REQ-PROC-005
- Acceptance criteria:
  1. Each candidate opportunity references the publication it came from and holds a one-sentence finding with an evidence quote from that publication.
  2. A publication can yield zero, one, or at most the configured number of candidates; an empty list includes a Notes reason.
  3. The extraction meets its eval threshold on the golden set, including papers that should yield no candidate.
- Verification: contract test and eval on the golden set

### REQ-PROC-006: Triage contract and scope rules

Triage has a documented scope rule, a typed decision, and a golden set.

- Phase: 2
- Priority: must
- Status: planned
- Source: Readiness assessment (triage was the only model-backed step without a contract)
- Depends on: REQ-PROC-005
- Acceptance criteria:
  1. A publication is in scope when its OpenAlex topics or arXiv categories map to a target industry in the topic map stored in configuration ([ingestion scope](../data-sources/ingestion-scope.md)).
  2. A triage decision is stored as `Accepted` (boolean), `TriageScore` (number 0..1), and `Reason` (enum: `accepted`, `incomplete`, `retracted`, `out-of-scope`, `low-score`, `daily-limit`), plus `Model` and `PromptVersion` when a model was used.
  3. The model part of triage follows the [contract conventions](../agents/contract-conventions.md) and has a contract test and a golden set of at least 20 entries (REQ-TEST-005).
  4. The daily limit and the time zone for the day boundary (UTC) are configuration.
- Verification: unit tests on scope rules, contract test, and eval on the golden set

### REQ-PROC-007: Thin end-to-end slice

One publication runs through every layer with stubbed agents, so the value of the output can be judged early.

- Phase: 2
- Priority: must
- Status: planned
- Source: OQ-016
- Depends on: REQ-PROC-004, REQ-PROC-005
- Acceptance criteria:
  1. A fixture publication is ingested, triaged, extracted, passed through every pipeline step with stubbed agent outputs, scored with a placeholder score model, and returned by the data API.
  2. The slice runs in the development environment from one command or scheduled trigger and writes a run report (REQ-NFR-008).
  3. The stubbed agent outputs are the examples of [examples](../examples/README.md), so the slice shows the final output shape.
  4. Stubs are replaced agent by agent in phase 3 without changing the pipeline.
- Verification: integration test of the slice with local bindings
