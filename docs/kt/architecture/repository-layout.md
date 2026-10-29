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
│   ├── research-agent
│   ├── startup-agent
│   └── scoring-agent
├── packages
│   ├── vector-store
│   ├── prompts
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
| `apps/dashboard` | Next.js dashboard | REQ-DASH-001, REQ-DASH-002, REQ-DASH-003 |
| `apps/api` | Read-only API Worker | REQ-API-001, REQ-API-002, REQ-API-003 |
| `apps/pipeline` | Collector, document processing, pipeline workflow | REQ-DATA-001, REQ-DATA-002, REQ-DATA-004, REQ-DATA-006, REQ-AGENT-007 |
| `agents/research-agent` | Opportunity extraction, Research Analyst, Problem Discovery | REQ-PROC-004, REQ-AGENT-001, REQ-AGENT-002 |
| `agents/startup-agent` | Market Analysis, Competition, Startup Generator | REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-005 |
| `agents/scoring-agent` | Relevance Agent and the deterministic scoring engine | REQ-AGENT-006, REQ-SCORE-001, REQ-SCORE-003 |
| `packages/models` | Schemas for records, agent contracts, and the API; shared by all code | REQ-TEST-002, REQ-API-003 |
| `packages/prompts` | One versioned prompt per agent | REQ-TEST-004 |
| `packages/vector-store` | Embedding and Vectorize access, semantic search | REQ-PROC-001, REQ-PROC-002, REQ-PROC-003 |
| `infrastructure/cloudflare` | Wrangler configuration, bindings, migrations | REQ-NFR-002 |

Each agent directory holds the agent's graph, its tests, and its golden set under `evals/`. Fixtures live next to the tests that use them (see [test data](../test/test-data.md)).

## Open points

- `apps/pipeline` holds the collector, the document-processing Workers, and the pipeline workflow (ADR 0007). It is added with the first collector code.
- The workspace is managed with pnpm, with no further monorepo tooling (ADR 0007).
