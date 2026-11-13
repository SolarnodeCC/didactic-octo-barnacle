---
title: "0104: Strategic-relevance review; the care-provider limit is a ceiling"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0104: Strategic-relevance review; the care-provider limit is a ceiling

- Decision status: Accepted
- Date: 2026-11-13
- Changes: the prompt `relevance@5`; the Rules of the [Relevance Agent](../agents/relevance.md). No label and no requirement changes.

## Context

After [ADR 0103](0103-effort-passes-within-one-level.md), strategic relevance is the largest Relevance failure left ([round four results](../test/analysis-benchmark-round-four-results.md)). It falls on twelve entries: the care-provider entries 009 and 011 to 015, the cross-industry entries 003 and 018, and 002, 007, 008, and 021.

On the care-provider and cross-industry entries the candidates bracket the labels. `relevance@3` set a limit for these customers: `IndustryFit` at most 70 and `FocusMatch` at most `partial`, which is the indirect band of [ADR 0099](0099-research-analyst-and-relevance-label-review.md). Gemma answers the limit itself on every such entry (fit 70 plus 5, a score of 75), including those labeled outside (011, 012, 018). DeepSeek goes the other way and scores several at 15 to 40, below their band (009, 011 to 015). On 002, 007, 008, and 021 Gemma scores 100, reading broad focus areas as covering the problem.

## Review

The owner reviewed the twelve bands under [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md). `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, not a candidate, labeled them blind under the rules of ADR 0099 (12 calls, USD 0.0032, metadata `Agent: relevance-band`). It agreed on six (003, 008, 009, 013, 014, 015) and differed on six:

| Entry | Label | Cross-check | Owner's decision |
|---|---|---|---|
| 002 | indirect | outside | Kept as drafted, for the owner to confirm in the pull request: DeepSeek also answers indirect (55 to 70), and regulatory monitoring touches public services |
| 007, 011, 012, 018 | outside | indirect, through "digital citizens", "drug discovery", "GxP manufacturing quality", "compliance automation" | Keep outside: read literally, none of those focus areas covers internal software reuse, nurse scheduling, hospital quality review, or modernization governance |
| 021 | indirect | within, through aerospace's "certification and airworthiness evidence" | Keep indirect: automotive names manufacturing quality and supply-chain resilience, not type approval or compliance evidence; supplier quality packages only touch them |

All twelve labels stay; the owner decided 007, 011, 012, 018, and 021 in the review and confirms 002 with this decision.

## Decision

The owner chose, on 2026-11-13:

- **`relevance@5`** adds one sentence after the care-provider limit: "That limit is a ceiling, not a default. For such a customer, score the closest industry 45-70 when the problem touches one of its focus areas indirectly and 20-45 when it touches none; never below 20 for the closest industry." It answers both patterns: Gemma treated the ceiling as the answer, DeepSeek dropped the closest industry below 20. The bands of ADR 0099 are unchanged; the sentence states them for these customers.
- Nothing else in the prompt changes. Relevance runs again from `main` once this is merged.

## Consequences

- OQ-036 stays open for Relevance until that run.
- Gemma's 100 on 002, 007, 008, and 021 is a reading of broad focus areas that the literal rule of ADR 0099 already addresses; the sentence does not target it, and those misses count as model errors.
