---
title: "0003: Run agents as plain TypeScript steps inside Cloudflare Workflows"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-AGENT-007, REQ-AGENT-010]
---

# 0003: Run agents as plain TypeScript steps inside Cloudflare Workflows

- Decision status: Accepted
- Date: 2026-10-29

## Context

The original stack named LangGraph and, optionally, CrewAI, and requires Cloudflare Workers and Workflows (REQ-NFR-002). CrewAI exists only for Python. LangGraph exists for Python and JavaScript (LangGraph.js). Cloudflare Workers run JavaScript and TypeScript natively, and the test strategy uses Vitest.

The pipeline needs durable steps that resume after a failure without repeating model calls (REQ-AGENT-007). Reviewing the agent contracts shows that every model-backed step (triage, extraction, and the six analysis agents) is one structured model call with validation and a bounded retry (REQ-AGENT-009, REQ-AGENT-010). None of them loops or chooses between tools. A graph runtime adds a dependency, bundle size on Workers, and a second state model beside Workflows for no current benefit.

## Options considered

1. **LangGraph.js inside Cloudflare Workflows.** Matches the stated stack and gives a ready structure for tool loops. Adds a dependency and a second state model that single-call steps barely use.
2. **Plain TypeScript functions as Workflow steps.** One durable step per agent, a shared `callModel` helper that sends the Zod schema, validates, repairs, and retries (REQ-AGENT-009 to REQ-AGENT-011). Smallest dependency surface and one state model.
3. **Python LangGraph or Python Workers.** A second language and runtime or a platform outside the stack.

## Decision

Option 2:

- All runtime code is TypeScript.
- Cloudflare Workflows orchestrates the pipeline: one workflow instance per candidate, one durable step per agent.
- Agents are plain functions behind one shared model-call helper in `packages/models`. The helper owns structured output, validation, repair, retry, concurrency, and usage records.
- LangGraph.js and CrewAI are removed from the technology stack. An agent that needs a real tool loop, such as Competition with a search tool (ADR 0013), starts as a bounded loop inside its step. A new ADR is needed before adding a graph library.

## Consequences

- The technology stack, `README.md`, `AGENTS.md`, and the agents index drop LangGraph and CrewAI.
- Durable state lives in Workflows and in storage, so no checkpointing library is needed.
- Agent tests run in the same Vitest setup as the rest of the code.
- Libraries that exist only for Python are out of reach unless a later ADR adds a separate service.
