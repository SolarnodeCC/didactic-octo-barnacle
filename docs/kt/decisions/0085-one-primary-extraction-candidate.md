---
title: "0085: Extraction returns one primary candidate"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-PROC-004, REQ-PROC-009, REQ-TEST-006]
---

# 0085: Extraction returns one primary candidate

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the candidate rule of [opportunity extraction](../agents/opportunity-extraction.md#rules), the prompt `extraction@3`, and one golden-set entry with the three analysis entries built on it. No requirement changes.

## Context

In round one of the benchmark ([ADR 0082](0082-benchmark-round-one-selects-no-model.md)) almost every extraction failure of `deepseek-v4.1-flash-1017` was the candidate count. 33 of the 38 golden-set entries are labelled with exactly one candidate, while the rule and the prompt said "one distinct problem is one candidate, up to the configured maximum" (3). Over three runs the model returned more candidates than labelled 40 times, fewer 13 times, and the labelled number 59 times; its quotes were almost always verbatim. The labels and the rule followed different readings of "distinct problem".

## Options considered

1. **One primary candidate; another only for a separate customer with a separate problem.** Chosen by the owner.
2. **Keep several candidates and relabel** where the extra candidates are sound.
3. **Drop the count check** and leave candidate quality to the model judge (OQ-020).

## Decision

- A publication yields one primary candidate: the strongest problem with the customer who has it.
- A further candidate is added only when the text names a separate customer with a separate problem, each with its own quotes. Variants of one problem, further consequences of it, and further problems of the same customer stay in the one candidate. The configured maximum (3) stays as an upper bound.
- The prompt `extraction@3` carries the rule; its other text is that of `extraction@2`, with the same sampling.
- The golden set follows the rule. `gs-extraction-003` had two candidates for the same customer (the organization that runs agentic coders); the owner kept the first (no durable, accountable record of agent work) and removed the second (the agentic coder as a supply-chain risk), with the three analysis entries built on it: `gs-problem-discovery-020`, `gs-relevance-020`, and `gs-research-analyst-020`. It was the only entry with more than one candidate; the extraction set now has 35 entries with one candidate and 4 with none.

## Consequences

- Fewer candidates per publication reach the six analysis agents, so the cost per publication falls. A publication with several opportunities for one customer yields only its strongest; the others are not lost from the text, but they are not scored.
- The extraction eval keeps its deterministic count check; it now tests the same rule the prompt states.
- The three analysis golden sets hold 33 entries each, above the minimum of 20.
- Usage records name the prompt version, so round two results on `extraction@3` are not mixed with round one on `extraction@2`.
