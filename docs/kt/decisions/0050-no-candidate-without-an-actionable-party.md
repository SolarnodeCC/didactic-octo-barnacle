---
title: "0050: No extraction candidate without a party that can act"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-PROC-009, REQ-TEST-005]
---

# 0050: No extraction candidate without a party that can act

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-038
- Changes: REQ-PROC-009 (new AC6) and the rules of [opportunity extraction](../agents/opportunity-extraction.md)

## Context

Some publications pass triage because they state a burden clearly, but the burden belongs to a population or a whole sector, and no customer is named who could adopt a product against it. Two golden-set entries show the case: `gs-extraction-015` (arXiv 2602.11223, a population-level burden of chronic disease) and `gs-extraction-020` (arXiv 2609.10350, systemic risk modeled for supervisors). The owner labeled both with no candidate in the review of 2026-11-02, before a general rule existed.

OQ-038 proposed to decide after the first extraction eval run. Because the labels already apply the rule, a prompt without it would fail models on those entries for a reason the contract never states.

## Options considered

1. **Adopt the rule now** and revisit it with the data of the first extraction eval run. Chosen.
2. **Wait for the first eval run.** Leaves the labels ahead of the contract.
3. **Reject the rule.** A supervisor or public body counts as a customer that can act; relabel 015 and 020.

## Decision

REQ-PROC-009 gets AC6: extraction returns no candidate when the stated burden belongs to a population or a sector as a whole and the text names no customer, as a role or organization type, that could adopt a product against it. `Notes` then says so. A named party that can act, for example a hospital or a bank's risk team, still makes a candidate when both quotes exist.

## Consequences

- The extraction prompt states the rule. The deterministic eval already scores it through the number of candidates of 015 and 020.
- After the first extraction eval run, the owner reviews the entries that a candidate model answered against this rule. A change to the rule needs a new ADR.
- OQ-038 is answered and removed from [open questions](../open-questions.md).
