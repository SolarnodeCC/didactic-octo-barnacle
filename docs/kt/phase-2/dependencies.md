---
title: Phase 2 dependencies
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-NFR-005, REQ-NFR-002, REQ-NFR-020]
---

# Phase 2 dependencies

## Gates

Phase 2 starts only when every gate below is closed ([Definition of Ready](../roadmap.md#definition-of-ready-for-a-phase)). WP0 to WP3 of the [build plan](build-plan.md) may run before then, because the benchmark that closes OQ-036 needs them.

| Gate | State on 2026-11-06 | Owner | Evidence that closes it |
|---|---|---|---|
| Phase 1 exit | Met: the data criterion of ADR 0051 is confirmed on the runs of 7 Nov (arXiv 14,035 and OpenAlex 16,134 publications with an abstract; the first `succeeded` arXiv run) | Lead engineer | The 7 November result in [ingestion scope](../data-sources/ingestion-scope.md) |
| OQ-014: legal phase-2 gate questions | Answered: questions 1 to 5 approved on 2026-11-06 with no conditions; the contact is `info@solarnode.cc`. Launch questions 6 to 12 stay open | `@SolarnodeCC` and legal | The [review brief](../legal/review-brief.md). Workers AI processing falls under the Cloudflare agreement of launch question 8 (ADR 0049) |
| OQ-036: models for triage and extraction | Open; round one covers triage and extraction only, two candidates each (benchmark plan) | AI engineering lead | Benchmark ADR on the golden sets ([benchmark plan](../test/model-benchmark-plan.md)); needs WP1 to WP3 |
| OQ-040: providers | Answered by ADR 0049: Workers AI for the pipeline, Anthropic as the eval judge only | `@SolarnodeCC` | ADR 0049 |
| OQ-038: population-level burden | Answered by ADR 0050 (REQ-PROC-009 AC6) | Product owner | ADR 0050; the first extraction eval run reviews the rule |
| OQ-005 benchmark run (ADR 0010) | Reference model fixed; benchmark not run. Candidate `embeddinggemma-300m` is deprecated on 2026-11-20 and replaced by `embeddinggemma-2` once available (ADR 0062) | AI engineering lead | Recall report on the corpus of ADR 0057 and an ADR if the model changes from `bge-base-en-v1.5` |
| Cost per publication (REQ-NFR-005) | Estimate recorded (EUR 0.0014) with placeholder token counts | Lead engineer | Estimate refreshed after the phase 1 exit run; budget formula of ADR 0059 |
| Requirement and agent documents approved | Closed on 2026-11-07: the requirement files were re-reviewed after ADRs 0063 to 0067, 0070, and 0071, and `agents/triage.md`, `agents/opportunity-extraction.md`, and `agents/contract-conventions.md` are `approved` | Product owner, AI engineering lead | WP0 |

## Order of the work packages

```mermaid
flowchart TD
  WP0[WP0 Readiness] --> G{Phase 2 gates}
  WP1[WP1 Foundations] --> WP2[WP2 callModel]
  WP2 --> WP3[WP3 Prompts]
  WP3 --> B[Benchmark: closes OQ-036]
  B --> G
  G --> WP4[WP4 Full text]
  G --> WP5[WP5 Embeddings and search]
  G --> WP6[WP6 Triage]
  G --> WP9[WP9 Budget]
  WP6 --> WP7[WP7 Extraction]
  WP4 -.full text input.-> WP7
  WP5 --> WP8[WP8 Retractions]
  WP7 --> WP8
  WP7 --> WP10[WP10 Thin slice]
  WP8 --> WP11[WP11 Throughput and exit]
  WP9 --> WP11
  WP10 --> WP11
```

- WP4, WP5, WP6, and WP9 can run in parallel once the gates are closed.
- WP7 does not wait for WP4. It reads full text only where WP4 has stored it, and the abstract otherwise.
- WP8 needs the vector deletion of WP5 and the candidate rows of WP7. It hides opportunities once WP10 adds that table.

## Cloudflare services

| Service | Used for | New in phase 2 | Limits to check (Cloudflare documentation) |
|---|---|---|---|
| Workers AI | Triage, extraction, embeddings | Yes (binding `AI`) | Rate limit per model; input size per call; batch size for embedding models |
| AI Gateway | Every model call, logs, cost | Gateway exists in bootstrap; first use | Request metadata size; log retention; whether the binding response carries the cost |
| Vectorize | Publication vectors | Index exists (ADR 0027); metadata indexes new | Maximum metadata indexes; topK with metadata returned; delete-by-ID batch size |
| Queues | Text, embedding, model queues | Three queues and their dead-letter queues | Batch size, delivery delay (maximum 12 hours), concurrency |
| Workflows | Candidate Workflow, thin slice only | Yes | Steps per instance; local development support |
| D1 | New tables | Migrations 0009 and 0010 | Rows written per batch; database size |
| R2 | Extracted text under `texts/` | New prefix | none new |

No new service outside the stack is added (REQ-NFR-002). The Cloudflare-hosted PDF conversion of ADR 0009 stays a fallback that would need its own ADR.

## Libraries

| Library | Package | Why | Check |
|---|---|---|---|
| `unpdf` | `apps/pipeline` | PDF text extraction (ADR 0009) | Licence (MIT), Workers build, `pnpm audit:ci` |
| none for IDs | `apps/pipeline` | Candidate IDs come from `deps.NewId` | It gives UUIDs today while [schema migration 0001](../architecture/schema-migration-0001.md) names ULIDs; keep UUIDs unless an ordered key is needed |
| `@cloudflare/workers-types` | dev only, where hand-written binding interfaces stop being enough | Types for AI, Vectorize, Workflows | Keep the structural interfaces if they suffice |

Every new dependency is SHA-pinned or version-locked as REQ-NFR-021 requires, and Dependabot covers it.

## Cost and quotas

- Provisional phase 2 budget (ADR 0059, REQ-NFR-005 AC1): the expected daily triage calls × the triage cost, plus the daily extraction limit × the extraction cost, plus the expected daily embeddings × the embedding cost, times 1.5, with the full-text input priced in. With the prices of 6 November 2026 and without embeddings and full text, that is about EUR 0.76 a day on the largest measured day and about EUR 0.21 at the mean volume. The first measured costs replace the estimate.
- The older figure of EUR 0.22 a day (100 × EUR 0.0014 × 1.5, OQ-013) counted one triage and one extraction call per extracted publication only. Triage of every ingested publication alone is about EUR 0.37 on the largest measured day.
- Benchmark budget: at most EUR 50 ([benchmark plan](../test/model-benchmark-plan.md)).
- Paid Workers AI models allow about 20 requests per minute each. The model queue's concurrency and the retry on 429 keep within it. WP2 measures it on the first calls.
