---
title: Requirements index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Requirements

Every requirement has a unique ID and testable acceptance criteria. Pull requests name the requirements they implement or change, and tests name the requirement they verify. The acceptance criteria were derived from the original README and still need team review; files stay `draft` until that review is done.

| Area | File | Scope |
|---|---|---|
| DATA | [data.md](data.md) | Research ingestion and document storage |
| PROC | [processing.md](processing.md) | Embeddings, vector search, opportunity extraction |
| AGENT | [agents.md](agents.md) | Multi-agent engine and output contracts |
| SCORE | [scoring.md](scoring.md) | Opportunity scoring |
| DASH | [dashboard.md](dashboard.md) | Dashboard, ranking, and trends |
| NFR | [non-functional.md](non-functional.md) | Platform, security, and documentation constraints |
| TEST | [testing.md](testing.md) | Test strategy obligations |

## Format

Each requirement is a level-3 heading followed by the six fields below. `scripts/check-kt.py` enforces the format.

```markdown
### REQ-DATA-001: Short title

Statement of what the platform must do.

- Phase: 1
- Priority: must
- Status: planned
- Source: where the requirement comes from
- Acceptance criteria:
  1. A verifiable criterion.
- Verification: the test or review that proves it
```

| Field | Allowed values |
|---|---|
| Phase | `1`, `2`, `3`, `4`, `later` (see the [roadmap](../roadmap.md)) |
| Priority | `must`, `should`, `could` |
| Status | `planned`, `in-progress`, `done`, `dropped` |

## Rules

- IDs are `REQ-<AREA>-<NNN>` and are never reused, also not after a requirement is dropped. Set `Status: dropped` instead of deleting it.
- A file holds at most 40 requirements; the check warns above 25. Split an area into a directory with its own `README.md` before it reaches the limit.
- A new area gets a new file and a row in the table above.
- Every REQ-ID mentioned anywhere in `docs/kt/` must be defined here.
