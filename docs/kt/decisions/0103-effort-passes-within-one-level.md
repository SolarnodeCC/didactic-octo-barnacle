---
title: "0103: Implementation effort passes within one level"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0103: Implementation effort passes within one level

- Decision status: Accepted
- Date: 2026-11-13
- Changes: the effort check of the Relevance eval (`agents/extraction/src/analysis/eval.ts`); the Evals section of the [Relevance Agent](../agents/relevance.md); the Relevance example in [golden sets](../test/golden-sets.md); the row of OQ-036 in [open questions](../open-questions.md). No requirement or prompt changes.

## Context

Relevance ran on `relevance@4`, which counts three blockers for ImplementationEffort ([ADR 0102](0102-effort-counts-three-blockers.md), [results](../test/analysis-benchmark-round-four-results.md)). Effort failures did not fall: 28 of 99 entry runs for Gemma and 34 for DeepSeek, against 30 and 27 on `relevance@3`. Gemma passed 54.5 / 54.5 / 60.6 % and DeepSeek 57.6 / 42.4 / 51.5 %.

Both candidates now reason in blockers but scope the MVP differently from the labels, for example a live link where the labels accept exported data. In the label review of ADR 0102 the drafting agent and the blind cross-check, applying the same written rule, agreed on 19 of 33 entries. An exact match on a four-level judgement that two careful readers share 58 % of the time cannot carry an entry pass rate of 0.80. Only 3 of the 198 round-four answers were two or more levels from the label.

## Options considered

1. **Effort passes within one level of the label.** Chosen.
2. **Report effort as an agreement rate, outside the entry pass.** Effort would no longer gate the eval at all.
3. **Keep the exact match.** Effort would keep failing for reasons the labels cannot settle.

## Decision

The owner chose, on 2026-11-13:

- ImplementationEffort is an ordered scale (S, M, L, XL). An answer one level from the label passes; two or more levels fail. This is the tolerance the numeric checks already have through their ranges.
- The labels stay as ADR 0102 set them; the prompt stays `relevance@4`.
- Relevance stays open. Scored within one level, round four passes Gemma at 72.7 / 72.7 / 75.8 % and DeepSeek at 81.8 / 69.7 / 75.8 %; neither reaches 0.80 in every run.

## Consequences

- An answer two levels off (S against L, M against XL) still fails, so the check keeps separating a small tool from a large programme.
- What remains of the Relevance failures is mostly strategic relevance on care-provider and cross-industry entries: DeepSeek scores several below their band, Gemma several above. It is reviewed next, before Relevance runs again.
- Round four cost EUR 0.21 (198 calls, USD 0.2317), the same as the gateway logs record.
