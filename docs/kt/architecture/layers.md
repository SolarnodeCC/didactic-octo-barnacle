---
title: Architecture layers
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Architecture layers

```text
          ┌──────────────────────┐
          │ Research Sources     │  OpenAlex, arXiv, Semantic Scholar
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Research Collector   │  scheduled, incremental, deduplicated
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Document Processing  │  PDFs, full text, licenses
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐        ┌──────────────────────┐
          │ Knowledge Layer      │        │ Storage              │
          └──────────┬───────────┘        │ records, files,      │
                     ▼                    │ vectors              │
          ┌──────────────────────┐        │ (all layers)         │
          │ Multi-Agent Engine   │        └──────────────────────┘
          └──────────┬───────────┘
                     ▼                    ┌──────────────────────┐
          ┌──────────────────────┐        │ Cross-cutting        │
          │ Opportunity Scoring  │        │ AI Gateway, logging, │
          └──────────┬───────────┘        │ access control       │
                     ▼                    └──────────────────────┘
          ┌──────────────────────┐
          │ API                  │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Dashboard            │
          └──────────────────────┘
```

Layers hand work to each other asynchronously: each layer stores its result and passes record IDs to the next one, so a failure in one layer does not lose the work of the layers before it.

| Layer | Responsibility | Details |
|---|---|---|
| Research Sources | External academic APIs | [Data sources](../data-sources/README.md) |
| Research Collector | Fetches publications and metadata on a schedule, normalizes and deduplicates them | REQ-DATA-001, REQ-DATA-002, REQ-DATA-003, REQ-DATA-005, REQ-DATA-007, REQ-DATA-009 |
| Document Processing | Stores openly licensed PDFs and extracts full text | REQ-DATA-004, REQ-DATA-006, REQ-DATA-010 |
| Knowledge Layer | Embeddings, vector database, semantic search, triage, retractions | REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-PROC-005, REQ-DATA-008 |
| Multi-Agent Engine | Extracts candidates and runs the analysis agents | REQ-PROC-004, [Agents](../agents/README.md), [Orchestration](orchestration.md) |
| Opportunity Scoring | Computes and explains the opportunity score | [Scoring](../scoring.md) |
| API | Read access for the dashboard, plus the score review write; separate auth and admin routes (ADR 0018) | REQ-API-001, REQ-API-002, REQ-API-003, REQ-API-004, REQ-API-005 |
| Dashboard | Shows ranked opportunities, explanations, and trends | REQ-DASH-001, REQ-DASH-002, REQ-DASH-003 |
| Storage | System of record, files, and vectors | [Data model](data-model.md) |
| Cross-cutting | Model routing and cost, logs and run reports, authentication, global limits (Durable Object) | REQ-NFR-003, REQ-NFR-005, REQ-NFR-007, REQ-NFR-008, REQ-AGENT-012 |

Which Cloudflare service implements each layer is proposed in ADR 0004 ([decisions](../decisions/README.md)). It is a decision once that ADR is accepted.
