---
title: "0004: Map architecture layers to Cloudflare services"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-NFR-003, REQ-NFR-007, REQ-AGENT-012]
---

# 0004: Map architecture layers to Cloudflare services

- Decision status: Accepted
- Date: 2026-10-29

## Context

The [architecture layers](../architecture/layers.md) do not say which Cloudflare service implements each layer. That mapping has to exist before the first Worker is written, because it decides bindings, storage, and tests.

## Options considered

- **Queues between every layer** gives loose coupling but makes a run hard to follow and to resume as one unit.
- **Workflows for long-running, multi-step work and Queues for fan-out** keeps each run traceable and resumable, with Queues only where many independent items are processed.
- **One Worker for everything** is simple at first but runs into per-invocation CPU and memory limits.

## Decision

The second option:

| Layer | Service |
|---|---|
| Research Collector | Cron Trigger starts one Workflow per source; it writes publications to D1 and sends new publication IDs to a Queue |
| Document Processing | Queue consumer Worker; PDFs and extracted text in R2 |
| Knowledge Layer | Embeddings through AI Gateway, vectors in Vectorize with source and date metadata; triage as a Worker step |
| Multi-Agent Engine | One Workflow instance per candidate, one step per agent (ADR 0003); outputs in D1 |
| Opportunity Scoring | Final Workflow step, plain TypeScript; scores in D1 |
| Data API | Worker in `apps/api`, reading D1; one write operation, the score review (REQ-API-004) |
| Auth and admin API | Routes in the same Worker under a separate prefix with their own CSRF and role checks (ADR 0018) |
| Dashboard | Next.js on Workers through the OpenNext adapter (ADR 0012) |
| Shared state | One Durable Object class for global limits (model-call concurrency, sign-in rate limits), see ADR 0017 |
| Storage | D1 is the system of record, R2 holds files, Vectorize holds vectors |
| Cross-cutting | AI Gateway for all model and embedding calls; Workers logs for structured logs; authentication through invitation-only accounts (ADR 0011) |

Each environment (see [operations](../operations.md)) has its own D1 database, R2 bucket, Vectorize index, Queue, Durable Object namespace, and AI Gateway.

Queue consumers are idempotent: a message may be delivered more than once, so a consumer checks stored state before it does work (REQ-DATA-011). Every Queue has a dead-letter queue.

## Consequences

- Integration tests run Workers, Workflows, Queues, D1, R2, and Vectorize bindings locally (see [test levels](../test/levels.md)).
- D1 has a maximum database size. Large text stays in R2 and D1 holds keys to it.
- Authentication is decided in ADR 0011 (invitation-only accounts with one-time email links); the platform stores no passwords (REQ-NFR-007).
- Durable Objects join the technology stack through ADR 0017.
