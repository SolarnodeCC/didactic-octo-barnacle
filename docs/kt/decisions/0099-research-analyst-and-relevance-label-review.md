---
title: "0099: Research Analyst and Relevance label review"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-001, REQ-AGENT-006, REQ-TEST-005]
---

# 0099: Research Analyst and Relevance label review

- Decision status: Accepted
- Date: 2026-11-13
- Changes: 45 golden-set entries in `agents/analysis/evals/research-analyst/` and `agents/analysis/evals/relevance/`, the Evals section of the [Relevance Agent](../agents/relevance.md), and the Relevance example in [golden sets](../test/golden-sets.md). No requirement and no prompt changes.

## Context

[ADR 0096](0096-analysis-round-one-results.md) and [ADR 0098](0098-relevance-rerun-label-review.md) kept Research Analyst and Relevance open and called for a review of their labels before they run again: the Novelty ranges, Maturity, and required industries of Research Analyst; the strategic-relevance ranges against the focus areas as written, and the implementation effort, of Relevance.

The answers of round one (`research-analyst@1`) and of the Relevance rerun (`relevance@2`) were recovered from the AI Gateway logs of `roi-staging`, 398 calls, so the review could see where the candidates disagreed with each label. Two patterns stood out:

- Under `relevance@2`, a problem within a focus area with a clear match scores 80 to 100, and one central to a focus area scores 100. Many labels capped at 85 or 90 for problems their own notes called a clear focus area, so both candidates failed entries whose industry they had right.
- The candidates split on care-provider and cross-industry problems: DeepSeek read them as outside the focus areas, Gemma as within.

## Options considered

1. **Strategic-relevance ranges follow the `relevance@2` scale.** The owner decides one band per entry against the focus areas, and the range follows. Chosen.
2. **Keep hand-set ranges and review each one.** Rejected: hand-set ranges would keep disagreeing with the scale the prompt states.

For reading the focus areas, three options were offered: literal with the industry's own customer (chosen), narrow (only a focus area that names the problem's function counts), and broad (any problem the words can cover, whoever the customer is).

## Decision

The owner chose, on 2026-11-12 and 2026-11-13:

- **Bands.** Each Relevance entry gets one band for its best industry, and its `strategicRelevanceRange` follows:

| Band | Meaning | Range |
|---|---|---|
| outside | organizations of the industry may have the problem, but no focus area covers it | [20, 50] |
| indirect | the problem touches one of the industry's focus areas indirectly | [45, 75] |
| within | the words of a focus area cover the problem, and the customer is an organization of that industry | [75, 100] |

- **Focus areas are read literally.** A care provider (hospital, clinic, nurses, health system) or a customer of every industry alike is at most `indirect`.
- **Effort labels stay.** An MVP that needs integrations or regulated data stays `L`; an `M` answer on such an entry counts as a model error.
- **Novelty ranges are not raised further.** On eight entries (009, 010, 017, 018, 023, 025, 027, 035), at least two of the three model families score above the range; raising them would tune the labels to the models.

The review followed [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md). Claude, not a candidate, drafted every entry from the abstract, the candidate, and the neighbors. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, another model family and not a candidate, labeled the same entries blind under the same rules (66 calls, USD 0.0497, 2026-11-12 16:07 to 16:11 UTC, metadata `Step: label-review`). The two agreed on 40 changed fields; the owner checked a random quarter of them (10) against the source and confirmed the rest. They disagreed on 16; the owner decided each after reading the source, and kept the draft in every case.

### Research Analyst

| Change | Entries |
|---|---|
| Novelty range raised (few or no comparable neighbors, or a clearly new finding) | 001 [50, 80]; 002, 012, 015, 022, 032 [40, 70]; 008, 016, 027 [30, 60]; 024 [35, 65] |
| Novelty range lowered (NovaFabric among the neighbors already gives tamper-evident agent evidence) | 003 [20, 50] |
| Maturity | 003 and 005 prototype to theoretical (nothing run); 009 prototype to field-tested (152,421 queries triaged in deployment); 013 lab-result to prototype (platform piloted with six clinicians); 014 and 029 prototype to lab-result (synthetic scenarios or queries) |
| Required industries | 003 four regulated industries to `other`; 015 `insurance` to `other`; 016 `banking, insurance` to `banking` |

Each `handoff` follows: the Novelty at the middle of the new range, and the new Maturity and industries.

### Relevance

| Change | Entries |
|---|---|
| Band `within`, [75, 100] | 001, 005, 022, 023, 024, 025, 026, 027, 028, 029, 030, 031, 032, 033, 034, 035 (006, 016, 017, 019 were already [75, 100]) |
| Band `indirect`, [45, 75] | 002, 008, 009, 010, 013, 015 (003, 014, 021 were already [45, 75]) |
| Band `outside`, [20, 50] | 007, 011, 012, 018 |
| Best industry | 003 `banking` to `aerospace-defense` (secure engineering is the literal focus area) |
| Technical feasibility, following the maturity scale | 003 and 005 [10, 40]; 009 [65, 90]; 013 [50, 75]; 014 [30, 60]; 019 and 029 [35, 65]; 007 [70, 95] and 018 [55, 85] (field-tested starts at 80) |
| Effort | 005 M to L (the validator runs inside the institution); 007 M to S (an InnerSource portal on existing tools); 025 L to M (an MVP for one market) |

The changes reverse five earlier notes, each recorded in the entry: 001 (agricultural disasters read as a public service), 003 (four regulated industries), 010 (radiology as diagnostics), 015 (insurance), and 029 (prototype).

## Consequences

- Research Analyst and Relevance run again from `main` after this decision is merged: `research-analyst@1` and `relevance@2`, unchanged. OQ-036 stays open for both until then.
- Problem Discovery reads the changed `handoff` blocks of 16 entries as input. Its provisional choice ([ADR 0096](0096-analysis-round-one-results.md)) is reviewed together with the fact judge, as planned.
- Effort remains the largest Relevance failure for both candidates on the round-one answers (31 of 99 runs for Gemma, 28 for DeepSeek).
- Industry coverage of [REQ-TEST-005](../requirements/testing.md) still holds: every target industry has at least two Research Analyst entries and two Relevance entries.
