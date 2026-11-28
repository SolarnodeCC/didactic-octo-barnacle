---
title: "0126: Tavily is the search provider"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-28
related: [REQ-AGENT-013, REQ-NFR-005, REQ-NFR-006, REQ-NFR-011, REQ-TEST-003]
---

# 0126: Tavily is the search provider

- Decision status: Accepted
- Date: 2026-11-28
- Supersedes: [ADR 0022](0022-search-provider-candidates.md)
- Builds on: [ADR 0013](0013-search-tool-for-market-and-competitor-evidence.md), [ADR 0039](0039-private-search-fixtures-from-tavily.md)

## Context

ADR 0022 named Brave Search and Tavily as candidates for the search tool of Market Analysis and Competition (REQ-AGENT-013). It planned to pick one on a competitor-recall set at the start of phase 3 (OQ-033). ADR 0039 already recorded search fixtures from Tavily, because Brave's terms forbid storing and evaluating results by default (section 3(b)). Brave would therefore have needed written permission before the comparison could even run. The search tool is WP1 of the [phase 3 build plan](../phase-3/build-plan.md), and the model choice for the three remaining agents waits on it.

## Options considered

1. **Run the comparison of ADR 0022.** It needs Brave's written permission first (legal brief item 12) and delays WP1.
2. **Choose Tavily now, without the comparison.** It is the provider whose terms let us keep recordings for evaluation. One provider, one DPA, one key. Chosen by the owner on 2026-11-28.

## Decision

- Tavily is the only search provider. Brave is dropped, and so is the comparison of ADR 0022. This answers OQ-033.
- The tool calls the Tavily REST API (`POST https://api.tavily.com/search`, `Authorization: Bearer`) with `fetch`. It does not use `@tavily/core`, which depends on axios, a library that does not suit the Workers runtime.
- A call uses `search_depth: basic` (1 API credit), with no generated answer and no raw page content. The price is a `Search` entry of the price table: USD 0.008 per credit at pay-as-you-go, read from Tavily's pricing and API-credits pages on 2026-11-28.
- There is one key, `SEARCH_PROVIDER_API_KEY`. The second key of ADR 0022 is dropped. The tool keeps a small provider seam (`tavilySearch` behind `createSearchTool`), so a later change of provider stays local to `agents/market`.
- The Tavily CLI (`tvly`) and Tavily's Agent Skills are developer tooling for coding agents. They are not part of the product and are not configured in this repository.
- Recordings stay private, and the repository holds only their manifest (ADR 0039).

## Consequences

- OQ-036 for Market Analysis, Competition, and Startup Generator no longer waits on a provider choice.
- Legal brief item 12 (Brave) is no longer needed. Item 8 confirms Tavily's DPA, and item 11 (written confirmation from Tavily about private evaluation fixtures) stays open.
- No benchmark that compares Tavily with another provider exists to be published, which also keeps clear of Tavily's terms (ADR 0039).
- If Tavily's terms or prices change, this decision is reviewed. The price lives in the price table, so a new table updates the budget without a code change.
