---
title: "0050: Phase 2 queue topology"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-DATA-006, REQ-PROC-001, REQ-PROC-004, REQ-PROC-005, REQ-NFR-010, REQ-DATA-011]
---

# 0050: Phase 2 queue topology

- Decision status: Proposed
- Date: 2026-11-06

## Context

Phase 2 adds text extraction, embeddings, triage, and extraction as Queue consumers in `apps/pipeline` (ADR 0004, [orchestration](../architecture/orchestration.md)). The two existing queues do not fit them:

- The page queue runs one message at a time, in order (ADR 0045).
- The document queue runs batches of 5, with up to 5 at once (ADR 0047). ADR 0009 asks for one PDF per invocation for unpdf, in a 128 MB isolate.

Embedding calls are cheapest in batches. Triage and extraction are one model call each and need a global limit on calls in flight. The orchestration document chains embed → triage, but triage does not read the embedding.

## Options considered

1. **One new queue for all phase 2 types.** It is simple, but it gives one batch size and one concurrency to work with very different costs.
2. **One queue per message type.** It is the most control, but also the most bindings and dead-letter queues for little gain.
3. **Three queues by resource:**
   - text extraction: memory-bound, one at a time per invocation;
   - embeddings: batched;
   - model steps: triage and extraction, one at a time, with bounded concurrency.

## Decision

Option 3, with `max_retries = 3`, the retry delays of ADR 0045, and a dead-letter queue each:

| Queue | Types | `max_batch_size` | `max_concurrency` |
|---|---|---|---|
| `roi-texts-<env>` | `document.extract_text` | 1 | 3 |
| `roi-embeddings-<env>` | `publication.embed` | 50 | 2 |
| `roi-models-<env>` | `publication.triage`, `publication.extract`, `candidate.run` | 1 | 8 |

- Embedding and triage both start from the page consumer when a publication is stored. Neither waits for the other.
- The concurrency of the model queue equals `model.semaphore_max` and is the global limit on model calls in phase 2. The Durable Object semaphore of ADR 0017 arrives in phase 3, when candidate Workflows also call models.
- The Worker tells the queues apart by name, and the messages by type, as today.

## Consequences

- unpdf gets one PDF per invocation, as ADR 0009 asks, without changing the document queue of ADR 0047.
- The [orchestration](../architecture/orchestration.md) choreography and the queue table in [defaults](../architecture/defaults.md) change when this is accepted: embed and triage become parallel.
- Bootstrap lists six new queues. The automated staging pipeline stops before the deploy until they exist (ADR 0046).
- Embedding calls are counted per batch call in `model_call`, not per publication.
