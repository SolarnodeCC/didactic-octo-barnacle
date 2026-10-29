---
title: Technology stack
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-NFR-002, REQ-NFR-003]
---

# Technology stack

| Area | Technology |
|---|---|
| Development | Cursor, Claude Code, GitHub, GitHub Actions |
| Cloud platform | Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, AI Gateway |
| AI and agents | LangGraph, OpenAI, Anthropic, CrewAI (optional) |
| Frontend | Next.js on Cloudflare Pages, Tailwind CSS |

Adding a runtime service, package manifest, or infrastructure component that this table does not list requires an update to this document in the same pull request, and an ADR when it replaces a listed technology.

## Proposed changes

These proposals are not decisions yet. The table above changes when the ADR is accepted.

| Topic | Proposal | Record |
|---|---|---|
| Agent runtime | LangGraph.js in TypeScript inside Cloudflare Workflows; drop CrewAI, which only exists for Python | ADR 0003 |
| Service per layer | Mapping of each architecture layer to a Cloudflare service | ADR 0004 |
| Authentication | Invitation-only accounts; one-time sign-in links sent through Resend; no passwords and no third-party identity providers | ADR 0007 |
| Dashboard hosting | Choose between Cloudflare Pages and the OpenNext adapter on Workers, which Cloudflare currently recommends for Next.js; verify before the first dashboard code | OQ-009 |

## Not chosen yet

Each of these is chosen with the first code that needs it, in an ADR, and added to the table:

- Language versions and package manager (OQ-018).
- Schema library for contracts, for example Zod (OQ-018).
- Embedding model (OQ-005).
- PDF text extraction, within Worker CPU and memory limits (OQ-006).
- Test tools: Vitest with the Cloudflare Workers pool, and Playwright, as proposed in [test levels](../test/levels.md) (OQ-018).

## Platform limits to design for

Workers have CPU time and memory limits per invocation, D1 has a maximum database size, and Vectorize has limits on dimensions and metadata. Check the current values in the Cloudflare documentation when designing a component, and record the limits a design depends on in its ADR.
