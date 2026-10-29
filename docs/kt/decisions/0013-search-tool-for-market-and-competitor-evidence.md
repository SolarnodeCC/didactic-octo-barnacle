---
title: "0013: Give Market Analysis and Competition a web search tool"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-008, REQ-AGENT-013, REQ-NFR-006]
---

# 0013: Give Market Analysis and Competition a web search tool

- Decision status: Accepted
- Date: 2026-10-29

## Context

Market Potential (25%) and Competitive Gap (20%) of the score depend on market figures and competitors. Without a source, every figure is a model estimate and every competitor is unverified, and evidence-required fields such as `Competition.Gap` cannot cite anything (OQ-007, OQ-008).

## Options considered

1. **Estimates only, labeled.** No new service. The score stays estimate-based and evidence for these fields cannot be met.
2. **A web search tool for the two agents.** Competitors can be verified and market figures sourced. Adds a service, cost per call, and untrusted content in the model input.

## Decision

Option 2, in phase 3:

- A search tool is available to Market Analysis and Competition only. It returns titles, URLs, and snippets through a Worker that calls the search provider; the model never calls the provider directly.
- Tool results are untrusted data, delimited like publication text (REQ-NFR-006). The tool has no write capability. Fetching a result page, if added, goes through an allowlisted fetcher with a size limit and no access to internal addresses.
- A competitor is `Verified: true` only when a search result supports it. A market figure is `Basis: sourced` only when it cites a result as `external-url` evidence with the retrieval date (REQ-AGENT-008).
- The number of tool calls per step, the result count, and the search budget are configuration. Search calls are recorded with the model calls (REQ-NFR-011) and count toward the daily budget (REQ-NFR-005).
- The search provider is chosen with OQ-031 before phase 3 starts. The choice needs no new ADR unless it adds a service outside the stack.

## Consequences

- Competition and Market Analysis become bounded loops inside their step (ADR 0003): at most a configured number of tool calls, then a final structured answer.
- Eval fixtures record search results so evals stay repeatable.
- The `estimate-based` label (ADR 0005) disappears for opportunities whose figures are sourced.
