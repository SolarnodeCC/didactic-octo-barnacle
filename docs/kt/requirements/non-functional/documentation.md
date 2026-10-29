---
title: Documentation requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Documentation requirements

The KT documents stay small, linked, and consistent.

### REQ-NFR-004: KT documents are checked in CI

The KT documents stay small, linked, and consistent.

- Phase: 1
- Priority: must
- Status: done
- Source: ADR 0002
- Acceptance criteria:
  1. CI fails when a KT file exceeds 400 lines or 25 KiB, or a requirement file holds more than 40 requirements.
  2. CI fails on missing frontmatter, broken relative links, a directory without an index, or an undefined or duplicate REQ-ID.
- Verification: `scripts/check-kt.py` in `.github/workflows/config.yml`
