---
title: "0098: Relevance stays open after the relevance@2 rerun; its labels are reviewed"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-12
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0098: Relevance stays open after the relevance@2 rerun; its labels are reviewed

- Decision status: Accepted
- Date: 2026-11-12
- Changes: the row of OQ-036 in [open questions](../open-questions.md). No requirement changes.

## Context

Relevance ran again on 12 November 2026 with `relevance@2`, which scores `IndustryFit` against each industry's focus areas ([ADR 0097](0097-relevance-industry-fit-against-focus-areas.md)): benchmarks `bench-2026-11-12T15-23-09-199Z` (Gemma, thinking off) and `bench-2026-11-12T15-23-11-452Z` (DeepSeek), from `main` at the merge of ADR 0097.

| Candidate | `relevance@1` | `relevance@2` | Failures over three runs (`relevance@2`) |
|---|---|---|---|
| Gemma, thinking off | 12.1 / 12.1 / 12.1 % | 12.1 / 12.1 / 12.1 % | strategic relevance 87, effort 38, feasibility 6, best industry 3 |
| DeepSeek | 12.1 / 6.1 / 15.2 % | 12.1 / 9.1 / 15.2 % | strategic relevance 66, effort 33, best industry 14, feasibility 6 |

The new scale did not change the outcome. Both candidates read almost every problem as within a focus area: Gemma marked the best industry's `FocusMatch` as `clear` on 32 of 33 entries (median top `IndustryFit` 95), DeepSeek on 23 and `partial` on 9 (median 90). The labels read the focus areas narrowly and put most entries at 25 to 65. The focus areas of the [overview](../overview.md) are broad ("Public services", "Risk management", "AI assistants"), so either reading can be argued; a further prompt wording would tune the model to the labels.

## Decision

- Relevance stays open.
- Its labels are reviewed against the focus areas as written, together with the Research Analyst review ([ADR 0096](0096-analysis-round-one-results.md)): the strategic-relevance ranges and the expected effort, which fails a third of the entry runs for both candidates. An agent drafts, a model of another family cross-checks blind, and the owner confirms each change ([ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md)). Relevance then runs again on `relevance@2`.

## Consequences

- OQ-036 stays open for Relevance and Research Analyst; Problem Discovery is answered provisionally (ADR 0096).
- The rerun cost EUR 0.19, the same as the gateway logs record: 200 calls, USD 0.2081.
