---
title: "0002: KT documents are the source of truth"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-NFR-004]
---

# 0002: KT documents are the source of truth

- Decision status: Accepted
- Date: 2026-10-28

## Context

All project information was in one `README.md`. That file would keep growing as the platform is built, and it had no numbered requirements to check pull requests against.

## Decision

- All project information is stored as knowledge transfer (KT) documents in `docs/kt/`, in English. They replace `README.md` as the source of truth; `README.md` becomes a summary that links to them.
- Requirements are numbered (`REQ-<AREA>-<NNN>`) with acceptance criteria, and pull requests and tests are checked against them.
- Files stay small: at most 400 lines and 25 KiB per file and at most 40 requirements per requirement file. CI fails above these limits.
- The test strategy is a KT document set in `docs/kt/test/`.

## Consequences

- `scripts/check-kt.py` runs in CI and enforces structure, size, links, and requirement IDs (REQ-NFR-004).
- `AGENTS.md`, `CONTRIBUTING.md`, and the Bugbot rules refer to `docs/kt/` instead of `README.md`.
- Contributors update the KT documents in the same pull request as the change they describe.
