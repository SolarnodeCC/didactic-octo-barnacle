---
title: "0102: Implementation effort counts three blockers"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-13
related: [REQ-AGENT-006, REQ-TEST-005]
---

# 0102: Implementation effort counts three blockers

- Decision status: Accepted
- Date: 2026-11-13
- Changes: the ImplementationEffort scale of the [Relevance Agent](../agents/relevance.md) and the prompt `relevance@4`; 14 effort labels in `agents/analysis/evals/relevance/`. No requirement changes.

## Context

Effort was the largest Relevance failure in round three ([ADR 0101](0101-analysis-round-three-results.md)): 30 of 99 entry runs for Gemma and 27 for DeepSeek. The errors ran both ways, 24 answers of M against an L label and 25 of L against an M label. The scale was not decidable:

| Effort | Old wording |
|---|---|
| M | three to six months **or** one specialist capability |
| L | six to twelve months **or** regulated data **or** integrations |

Almost every enterprise MVP needs integrations or a specialist, so both candidates listed integration and privacy constraints on nearly every entry and then chose L or M at random. The labels were no more consistent: 012 (patient records) was L while 010, 013, and 015 (patient data) were M, and 026 was L for market data integrations while 027 was M with existing data.

## Options considered

1. **Count blockers.** Chosen.
2. **Keep the wording and fix the inconsistent labels.** The scale would stay ambiguous for the models.
3. **Report effort without gating on it.** That changes the eval gate of REQ-TEST-005 and leaves effort unmeasured.

## Decision

The owner chose, on 2026-11-13, after a question-and-answer review:

- ImplementationEffort counts three blockers that an MVP for the named customer cannot ship without:
  - **live integration**: reading live from or writing into the customer's operational systems. Public data, files the customer exports, and the research's released data do not count;
  - **regulated personal data**: patient health records, payment data, or customer financial records;
  - **domain experts**: only clinical, legal, actuarial, or regulatory specialists. Other domain or engineering expertise, machine learning, data science, and optimization do not count.
- S has none of the blockers, M exactly one, L two or more. XL is new research, or a product that itself needs certification by law before first use (medical-device clearance, airworthiness, security accreditation); software that supports regulated work is not XL.
- The blocker count decides the level; the month figures stay only as a description.
- `relevance@4` states the scale; nothing else in the prompt changes.

The labels were reviewed under [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md). Claude drafted all 33 entries with the blockers it counted. `@cf/meta/llama-3.3-70b-instruct-fp8-fast` labeled them blind under the draft wording (33 calls, USD 0.0098, metadata `Agent: relevance-effort`) and agreed on 19. Of the 14 disagreements, five counted other domain experts (019, 022, 027, 028, 030) and five read regulated work as certification (011, 014, 029, 034, 035); the owner answered both by tightening the wording above. The owner kept the draft on the other four (001, 013, 021, 031) and confirmed all labels.

| Change | Entries |
|---|---|
| M to S (no blocker) | 002, 018, 019, 027, 029 |
| L to M (one blocker) | 001, 022, 023, 026, 028, 030, 034 |
| M to L (patient data and clinical or payer experts) | 010, 015 |

Each entry's notes name the blockers counted.

## Consequences

- Relevance runs again from `main` once this is merged, with the same candidates, budgets, and threshold. OQ-036 stays open for Relevance until then.
- Five entries are now S. Neither candidate answered S often under the old wording, so the S labels test the new scale directly.
