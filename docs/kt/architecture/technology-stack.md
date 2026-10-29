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
| Language and runtime | TypeScript (strict, ES modules); Node 24 LTS for tooling (ADR 0007) |
| Package manager | pnpm workspaces (ADR 0007) |
| Contract schemas | Zod in `packages/models` (ADR 0007) |
| Tests | Vitest, `@cloudflare/vitest-plugin`, Playwright (ADR 0007) |
| Embedding model | Workers AI `bge-base-en-v1.5` as the reference; final choice by benchmark (ADR 0009, OQ-005) |
| PDF text extraction | unpdf in the document-processing Queue consumer (ADR 0008) |

Adding a runtime service, package manifest, or infrastructure component that this table does not list requires an update to this document in the same pull request, and an ADR when it replaces a listed technology.

## Proposed changes

These proposals are not decisions yet. The table above changes when the ADR is accepted.

| Topic | Proposal | Record |
|---|---|---|
| Agent runtime | LangGraph.js in TypeScript inside Cloudflare Workflows; drop CrewAI, which only exists for Python | ADR 0003 |
| Service per layer | Mapping of each architecture layer to a Cloudflare service, with Cloudflare Access for authentication | ADR 0004 |
| Dashboard hosting | Choose between Cloudflare Pages and the OpenNext adapter on Workers, which Cloudflare currently recommends for Next.js; verify before the first dashboard code | OQ-009 |

## Not chosen yet

Each of these is chosen with the first code that needs it, in an ADR, and added to the table:

- The final embedding model (OQ-005), chosen by the benchmark in ADR 0009.

## Platform limits to design for

Workers have CPU time and memory limits per invocation, D1 has a maximum database size, and Vectorize has limits on dimensions and metadata. Check the current values in the Cloudflare documentation when designing a component, and record the limits a design depends on in its ADR.
