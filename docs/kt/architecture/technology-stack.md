---
title: Technology stack
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
related: [REQ-NFR-002, REQ-NFR-003, REQ-AGENT-013]
---

# Technology stack

| Area | Technology |
|---|---|
| Development | Cursor, Claude Code, GitHub, GitHub Actions |
| Cloud platform | Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, AI Gateway, Durable Objects (ADR 0017) |
| AI and agents | Plain TypeScript agents in Workflow steps (ADR 0003); OpenAI and Anthropic through AI Gateway; a web search provider for two agents (ADR 0013, OQ-033) |
| Frontend | Next.js on Workers through the OpenNext adapter (ADR 0012), Tailwind CSS |
| Language and runtime | TypeScript (strict, ES modules); Node 24 LTS for tooling (ADR 0008) |
| Package manager | pnpm workspaces (ADR 0008) |
| Contract schemas | Zod in `packages/models` (ADR 0008) |
| Tests | Vitest, `@cloudflare/vitest-plugin`, Playwright (ADR 0008) |
| Embedding model | Workers AI `bge-base-en-v1.5` as the reference; final choice by benchmark (ADR 0010, OQ-005) |
| PDF text extraction | unpdf in the document-processing Queue consumer (ADR 0009) |

Adding a runtime service, package manifest, or infrastructure component that this table does not list requires an update to this document in the same pull request, and an ADR when it replaces a listed technology.

## Proposed changes

These proposals are not decisions yet. The table above changes when the ADR is accepted.

| Topic | Proposal | Record |
|---|---|---|
| Authentication and email | Invitation-only accounts; one-time sign-in links sent through Resend; no passwords and no third-party identity providers | ADR 0011 |

## Not chosen yet

Each of these is chosen with the first code that needs it, in an ADR, and added to the table:

- The final embedding model (OQ-005), chosen by the benchmark in ADR 0010.
- The web search provider (OQ-033), chosen before phase 3.
- Lint and format tools, chosen with the first package.

## Platform limits to design for

Workers have CPU time and memory limits per invocation, D1 has a maximum database size, and Vectorize has limits on dimensions and metadata. Check the current values in the Cloudflare documentation when designing a component, and record the limits a design depends on in its ADR.
