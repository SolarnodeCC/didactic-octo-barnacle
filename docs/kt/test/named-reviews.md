---
title: Named reviews
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-TEST-001]
---

# Named reviews

Requirements verified by a named review or a CI check script instead of a Vitest case (REQ-TEST-001). `scripts/check-traceability.py` reads this table.

| REQ-ID | Verification | Named by |
|---|---|---|
| REQ-NFR-004 | `scripts/check-kt.py` in `.github/workflows/config.yml` | CI Configuration workflow |
