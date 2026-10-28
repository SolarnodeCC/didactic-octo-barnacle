---
title: Security and data protection
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-NFR-001, REQ-NFR-006, REQ-NFR-007, REQ-NFR-009, REQ-DATA-010]
---

# Security and data protection

## Threats and controls

| Threat | Control | Requirement |
|---|---|---|
| Instructions hidden in a paper steer an agent (prompt injection) | Paper text is delimited data; agents have no write tools; output is validated against the contract; injection fixtures in tests | REQ-NFR-006 |
| A leaked API key or Cloudflare token | Secrets only in Cursor environment secrets or GitHub Actions secrets; secret scanning with push protection; least-privilege tokens per environment | REQ-NFR-001 |
| Model spending runs away | Daily budget and per-run cost reporting through AI Gateway | REQ-NFR-005 |
| Unauthorized access to opportunities | Authentication in front of the dashboard and the API | REQ-NFR-007 |
| Secrets exposed to untrusted code in CI | Pull request jobs run without secrets; live evals only for branches in this repository (ADR 0006) | REQ-TEST-003, REQ-TEST-004 |
| Redistribution of copyrighted papers | License recorded per document; PDFs stored and served only when the license allows it | REQ-DATA-010 |
| Vulnerable dependencies | Dependabot, pinned versions, and a dependency review gate in CI | see [CI gates](../test/ci-gates.md) |

## Authentication

The MVP has one group of internal users. ADR 0004 proposes Cloudflare Access in front of the dashboard and the API, so no user passwords are stored. Multi-tenancy and organization profiles are later work (REQ-DASH-005, OQ-010).

## Personal data

- **Authors**: names, ORCIDs, and affiliations come from public scholarly records. They are stored to show provenance and are not used to profile people (REQ-NFR-009).
- **Users**: the identity from authentication and, later, their feedback (REQ-DASH-004).
- **Model providers**: publication text and agent prompts are sent to model providers. No user data is sent. Check the provider's data retention terms before going live (OQ-014).

## Model providers

- All calls go through AI Gateway (REQ-NFR-003), which is the single place to log, rate-limit, and switch providers.
- Provider keys are stored as secrets of the gateway or the Worker, never in code.
