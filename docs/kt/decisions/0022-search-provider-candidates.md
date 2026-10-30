---
title: "0022: Benchmark Brave Search and Tavily for the search tool"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-AGENT-013]
---

# 0022: Benchmark Brave Search and Tavily for the search tool

- Decision status: Accepted
- Date: 2026-10-29

## Context

ADR 0013 requires a web search tool for Market Analysis and Competition. OQ-033 asked which two providers to benchmark before phase 3. Without named candidates, fixtures and DPAs cannot start.

## Options considered

1. **Defer naming until phase 3.** Keeps flexibility; blocks fixture and legal prep.
2. **Lock two candidates now; pick the winner on a competitor-recall set at the start of phase 3.**

## Decision

Option 2. The two candidates are **Brave Search API** (primary candidate) and **Tavily** (second candidate). At the start of phase 3, compare them on a competitor-recall set for recall, cost per call, terms for storing result snippets, and data processing agreement. Record the winner in a superseding ADR. Until then, agent code uses a provider interface; secrets are `SEARCH_PROVIDER_API_KEY` and `SEARCH_PROVIDER_FALLBACK_API_KEY`.

## Consequences

- OQ-033 is answered for candidate selection; the production winner remains a phase-3 measurement.
- Search call I/O uses the schema in [defaults](../architecture/defaults.md).
- Legal must review both vendors' storage terms before phase 3 exit (see [legal review brief](../legal/review-brief.md)).
