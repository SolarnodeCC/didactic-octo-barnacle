---
title: "0010: Choose the embedding model by benchmark, starting from bge-base-en-v1.5"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-NFR-003]
---

# 0010: Choose the embedding model by benchmark, starting from bge-base-en-v1.5

- Decision status: Accepted
- Date: 2026-10-29

## Context

OQ-005 asks which embedding model to use. REQ-PROC-001 requires an embedding of every title and abstract with a recorded model name and version, and a backfill when the model changes. REQ-PROC-003 requires recall at 10 to meet a threshold on the fixture corpus. Vectorize allows at most 1536 dimensions per vector. REQ-NFR-003 requires embedding calls to go through AI Gateway.

## Options considered

| Candidate | Notes |
|---|---|
| Workers AI `bge-base-en-v1.5` | 768 dimensions, English, runs inside Cloudflare. Lowest complexity and probably the lowest cost. |
| Workers AI `bge-m3` | Multilingual. Relevant if non-English papers are in scope. |
| Workers AI `embeddinggemma-300m`, `qwen3-embedding-0.6b` | Newer models. Benchmarked, not assumed better. |
| OpenAI or Anthropic ecosystem embeddings | Possibly higher quality, with higher cost and another dependency. |
| Semantic Scholar SPECTER2 | Built for scientific papers. Depends on Semantic Scholar data and its licence terms (OQ-014), and on enrichment that is `Phase: later` (REQ-DATA-003). |

## Decision

- No final model is chosen yet. The model is selected from benchmark results on the fixture corpus (REQ-PROC-003).
- Until then `bge-base-en-v1.5` on Workers AI is the reference implementation. Phase 2 code is built against it.
- Every candidate must produce vectors of at most 1536 dimensions and be callable through AI Gateway. A candidate that cannot meets neither constraint and is dropped.
- The model name and version are recorded with each embedding (REQ-PROC-001).
- Vectorize indexes are versioned per model as `publications-<model>-<dim>`. A model change creates a new index, backfills it, and switches search only when the backfill is complete.

### Benchmark criteria

1. Recall at 10 on the fixture corpus.
2. p95 latency.
3. Cost per 1,000 publications.
4. Storage footprint per vector.
5. Duration of a full re-index.

The selected model is the cheapest and simplest candidate that meets the recall threshold stored with the corpus; a candidate that beats it on recall must justify its extra cost and complexity.

## Consequences

- OQ-005 stays open until the benchmark runs. Its result is recorded by superseding this ADR or adding a new one that names the chosen model.
- Replacing the model is cheap because of the versioned indexes; the old index is deleted after the switch.
- Check the current Workers AI model specs (dimensions, input token limit, pricing) and that AI Gateway supports each candidate before the benchmark starts.
- A multilingual candidate matters only if the ingestion scope (OQ-012) includes non-English papers.
