---
title: "0003: Run agents with LangGraph.js inside Cloudflare Workflows"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-NFR-002, REQ-AGENT-007]
---

# 0003: Run agents with LangGraph.js inside Cloudflare Workflows

- Decision status: Proposed
- Date: 2026-10-28

## Context

The stack names LangGraph and, optionally, CrewAI, and requires Cloudflare Workers and Workflows (REQ-NFR-002). LangGraph exists for Python and for JavaScript (LangGraph.js). CrewAI exists only for Python. Cloudflare Workers run JavaScript and TypeScript natively; Python Workers exist but support fewer packages. The test strategy proposes Vitest with the Cloudflare Workers pool, which is TypeScript.

The pipeline needs durable steps that resume after a failure without repeating model calls (REQ-AGENT-007).

## Options considered

1. **LangGraph.js inside Cloudflare Workflows.** TypeScript everywhere. Workflows gives durable steps and retries between agents; LangGraph.js structures the work inside an agent where it needs loops or tools.
2. **Python LangGraph on a container host outside Cloudflare.** Full Python ecosystem, including CrewAI, but adds a platform outside the stack, a second language, and a network hop for every pipeline step.
3. **Python Workers.** Stays on Cloudflare, but package support is limited and the test strategy would need a second toolchain.
4. **No agent framework.** Plain TypeScript functions as Workflow steps. Simplest, but every agent re-implements tool loops and structured output handling.

## Decision

Option 1, if accepted:

- All runtime code is TypeScript.
- Cloudflare Workflows orchestrates the pipeline: one workflow instance per candidate, one durable step per agent.
- LangGraph.js is used inside an agent step when the agent needs more than one model call; a single structured call needs no graph.
- CrewAI is removed from the technology stack.

## Consequences

- The technology stack, the root `README.md`, and `AGENTS.md` drop CrewAI when this ADR is accepted.
- Durable state lives in Workflows and in storage, so LangGraph checkpointing is not needed between agents.
- Agent tests run in the same Vitest setup as the rest of the code.
- Libraries that exist only for Python are out of reach unless a later ADR adds a separate service.
