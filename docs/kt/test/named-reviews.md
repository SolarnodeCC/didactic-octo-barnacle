---
title: Named reviews
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-TEST-001]
---

# Named reviews

Requirements verified by a named review or a CI check script instead of a Vitest case (REQ-TEST-001). `scripts/check-traceability.py` reads this table.

| REQ-ID | Verification | Named by |
|---|---|---|
| REQ-NFR-001 | Code review, Bugbot, and GitHub secret scanning with push protection (outside CI); the owner confirmed on 2026-11-06 that secret scanning with push protection is enabled (ADR 0052) | Reviewer of each pull request; repository settings |
| REQ-NFR-004 | `scripts/check-kt.py` in `.github/workflows/config.yml` | CI Configuration workflow |
| REQ-TEST-001 | `scripts/check-traceability.py` in `.github/workflows/ci.yml`, with its own tests in `scripts/tests/` | CI workflow |
