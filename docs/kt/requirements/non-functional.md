---
title: Non-functional requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Non-functional requirements

### REQ-NFR-001: No secrets in the repository

Credentials are never committed.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: AGENTS.md repository conventions
- Acceptance criteria:
  1. API keys and Cloudflare tokens are stored in Cursor environment secrets or GitHub Actions secrets.
  2. Configuration names the secret instead of containing its value.
- Verification: code review and Bugbot

### REQ-NFR-002: Cloudflare platform

The platform runs on the Cloudflare services listed in the [technology stack](../architecture/technology-stack.md).

- Phase: 1
- Priority: must
- Status: planned
- Source: README Technology Stack
- Acceptance criteria:
  1. Every runtime component is deployed as a Cloudflare Worker, Workflow, or Pages project.
  2. A service outside the listed stack is only added with an ADR.
- Verification: code review

### REQ-NFR-003: Model calls through AI Gateway

All calls to model providers go through Cloudflare AI Gateway.

- Phase: 2
- Priority: should
- Status: planned
- Source: README Technology Stack
- Acceptance criteria:
  1. No component calls OpenAI or Anthropic directly.
  2. Cost and latency per agent can be read from the gateway.
- Verification: code review and integration test

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
