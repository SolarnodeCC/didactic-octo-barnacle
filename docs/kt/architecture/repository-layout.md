---
title: Repository layout
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Repository layout

The planned layout once code exists:

```text
├── apps
│   ├── dashboard
│   ├── api
│   └── pipeline
├── agents
│   ├── extraction
│   ├── analysis
│   ├── market
│   └── startup
├── packages
│   ├── vector-store
│   ├── prompts
│   ├── scoring
│   └── models
├── infrastructure
│   └── cloudflare
├── docs
│   └── kt
└── scripts
```

`docs/kt` and `scripts` exist today. The other directories are not implemented yet. When an application is added, extend the `install` command in `.cursor/environment.json` and the `setup-worktree` commands in `.cursor/worktrees.json`.

## What goes where

| Directory | Holds | Requirements |
|---|---|---|
| `apps/dashboard` | Next.js dashboard on Workers (OpenNext, ADR 0012) | REQ-DASH-001, REQ-DASH-002, REQ-DASH-003 |
| `apps/api` | Data API (read-only plus score review), auth and admin routes, and the global-limits Durable Object (ADR 0017, ADR 0018) | REQ-API-001, REQ-API-002, REQ-API-003, REQ-API-004, REQ-API-005, REQ-ADM-001 |
| `apps/pipeline` | Collector, document processing, pipeline workflow (it composes the agents and `packages/scoring`) | REQ-DATA-001, REQ-DATA-002, REQ-DATA-004, REQ-DATA-006, REQ-AGENT-007 |
| `agents/extraction` | Triage and opportunity extraction | REQ-PROC-005, REQ-PROC-006, REQ-PROC-004 |
| `agents/analysis` | Research Analyst, Problem Discovery, Relevance | REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-006 |
| `agents/market` | Market Analysis and Competition, with the search tool | REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-013 |
| `agents/startup` | Startup Generator | REQ-AGENT-005 |
| `packages/scoring` | The deterministic scoring engine; plain code, not an agent | REQ-SCORE-001, REQ-SCORE-002, REQ-SCORE-003 |
| `packages/models` | Schemas for records, agent contracts, and the API; shared by all code | REQ-TEST-002, REQ-API-003 |
| `packages/prompts` | One versioned prompt per agent | REQ-TEST-004 |
| `packages/vector-store` | Embedding and Vectorize access, semantic search | REQ-PROC-001, REQ-PROC-002, REQ-PROC-003 |
| `infrastructure/cloudflare` | Wrangler configuration per environment, bindings, SQL migrations, and the idempotent bootstrap script (ADR 0020) | REQ-NFR-002, REQ-NFR-020 |

Each agent directory holds its agent functions, their tests, and their golden sets under `evals/`. `packages/scoring` holds unit tests with fixed inputs. Fixtures live next to the tests that use them (see [test data](../test/test-data.md)).

## Open points

- `apps/pipeline` holds the collector, the document-processing Workers, and the pipeline workflow (ADR 0008). It is added with the first collector code.
- The workspace is managed with pnpm, with no further monorepo tooling (ADR 0008).
