---
title: Requirements index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Requirements

Every requirement has a unique ID and testable acceptance criteria. Pull requests name the requirements they implement or change, and tests name the requirement they verify. The acceptance criteria were derived from the original README and a KT review, and still need team review; files stay `draft` until that review is done (see [Review](#review)).

| Area | File | Scope |
|---|---|---|
| DATA | [data.md](data.md) | Research ingestion and document storage |
| PROC | [processing.md](processing.md) | Embeddings, vector search, opportunity extraction |
| AGENT | [agents.md](agents.md) | Multi-agent engine and output contracts |
| SCORE | [scoring.md](scoring.md) | Opportunity scoring |
| DASH | [dashboard.md](dashboard.md) | Dashboard, ranking, and trends |
| API | [api.md](api.md) | Read API for the dashboard |
| NFR | [non-functional.md](non-functional.md) | Platform, security, and documentation constraints |
| TEST | [testing.md](testing.md) | Test strategy obligations |

## Format

Each requirement is a level-3 heading followed by the six fields below. `scripts/check-kt.py` enforces the format. `Depends on` is optional and lists the requirements that must be done first.

```markdown
### REQ-DATA-001: Short title

Statement of what the platform must do.

- Phase: 1
- Priority: must
- Status: planned
- Source: where the requirement comes from
- Depends on: REQ-DATA-005
- Acceptance criteria:
  1. A verifiable criterion.
- Verification: the test or review that proves it
```

| Field | Allowed values |
|---|---|
| Phase | `1`, `2`, `3`, `4`, `later` (see the [roadmap](../roadmap.md)) |
| Priority | `must`, `should`, `could` |
| Status | `planned`, `in-progress`, `done`, `dropped` |
| Depends on | a comma-separated list of REQ-IDs (optional) |

## Rules

- IDs are `REQ-<AREA>-<NNN>` and are never reused, also not after a requirement is dropped. Set `Status: dropped` instead of deleting it.
- A file holds at most 40 requirements; the check warns above 25. Split an area into a directory with its own `README.md` before it reaches the limit.
- A new area gets a new file and a row in the table above.
- Every REQ-ID mentioned anywhere in `docs/kt/` must be defined here.
- A requirement does not depend on a requirement in a later phase.

## Review

A requirement file moves from `draft` to `approved` when a code owner of `docs/kt` has reviewed every requirement in it in a pull request. The review checks that each requirement is needed, that its acceptance criteria can be tested, and that its phase matches the [roadmap](../roadmap.md). Requirements of a phase are approved before that phase starts (see the Definition of Ready in the roadmap).
