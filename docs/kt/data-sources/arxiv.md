---
title: arXiv
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-DATA-002, REQ-DATA-008, REQ-DATA-010]
---

# arXiv

Used for preprints in computer science, which often appear on arXiv months before a journal or conference version. Ingestion is a phase 1 deliverable (REQ-DATA-002).

## Categories

"Computer Science" on arXiv covers every `cs.*` category. The pilot scope uses `cs.AI`, `cs.SE`, `cs.HC`, and `cs.CY` ([ingestion scope](ingestion-scope.md)). The other categories below are added by configuration once volume and cost are measured (OQ-012):

| Category | Area |
|---|---|
| `cs.AI` | Artificial Intelligence |
| `cs.SE` | Software Engineering |
| `cs.LG` | Machine Learning |
| `cs.CL` | Computation and Language |
| `cs.HC` | Human-Computer Interaction |
| `cs.IR` | Information Retrieval |
| `cs.CY` | Computers and Society |

A preprint is in scope when its primary category or a cross-listed category is in the list.

## Ingestion

- Use the arXiv API or OAI-PMH for metadata, not page scraping. The API terms ask for no more than one request every three seconds.
- arXiv IDs carry a version (`v1`, `v2`). A new version updates the same publication (REQ-DATA-002).
- Withdrawn preprints are flagged (REQ-DATA-008).

## Licensing

arXiv metadata, including abstracts, is available under CC0. The PDF of each preprint has its own license, chosen by the authors. Many grant arXiv a distribution license only, which does not allow us to redistribute the PDF. Store and show a PDF only when its license allows it (REQ-DATA-010, OQ-014); otherwise link to arXiv.

## Verify before implementing

- Current API terms and rate limits, and whether bulk access is preferred for a backfill.
