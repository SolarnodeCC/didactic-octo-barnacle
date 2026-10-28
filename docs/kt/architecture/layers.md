---
title: Architecture layers
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Architecture layers

```text
          ┌──────────────────────┐
          │ Research Sources     │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Research Collector   │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Document Processing  │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Knowledge Layer      │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Multi-Agent Engine   │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Opportunity Scoring  │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Dashboard            │
          └──────────────────────┘
```

| Layer | Responsibility | Details |
|---|---|---|
| Research Sources | External academic APIs | [Data sources](../data-sources/README.md) |
| Research Collector | Fetches publications and metadata | REQ-DATA-001, REQ-DATA-002, REQ-DATA-003 |
| Document Processing | Stores PDFs and extracts metadata | REQ-DATA-004, REQ-DATA-005 |
| Knowledge Layer | Embeddings, vector database, semantic search | REQ-PROC-001, REQ-PROC-002, REQ-PROC-003 |
| Multi-Agent Engine | Runs the analysis agents | [Agents](../agents/README.md) |
| Opportunity Scoring | Computes the opportunity score | [Scoring](../scoring.md) |
| Dashboard | Shows ranked opportunities and trends | REQ-DASH-001, REQ-DASH-002, REQ-DASH-003 |

Which Cloudflare service implements each layer is not decided yet. Record that mapping as an ADR in [decisions](../decisions/README.md) before the first implementation.
