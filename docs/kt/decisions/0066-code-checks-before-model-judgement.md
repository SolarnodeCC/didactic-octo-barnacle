---
title: "0066: Code checks before model judgement"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-PROC-009, REQ-AGENT-002, REQ-NFR-008]
---

# 0066: Code checks before model judgement

- Decision status: Accepted
- Date: 2026-11-07
- Answers: none
- Changes: REQ-PROC-009 AC4; [opportunity extraction](../agents/opportunity-extraction.md) and the phase 2 [schema](../phase-2/schema.md)

## Context

The platform already moves decisions out of the model where it can: triage returns signals and code decides (ADR 0036), scores are computed by code (ADR 0005), and evidence levels are derived by code (ADR 0040). Extraction still leaves one hard rule to the model alone. REQ-PROC-009 AC4 says that a generic or implied party ("users", "people") does not count as `Customer`, but nothing checks it after the model answers. A candidate with `Customer: users` and a correct quote passes every check and goes on to the phase 3 agents, where it cannot be sized or reached.

With no person reviewing output, every rule that code can check should be checked by code. The 2026-11-07 review of the agent chain found two more rules that code could check, but whose precision is not yet known.

## Options considered

1. **A blocking denylist for generic customers now, and further checks as report-only until the golden sets show they are precise.** Chosen.
2. **Block on every check at once.** Rejected: a check with false positives would drop good candidates without a person to notice.
3. **A second model call that judges the customer.** Rejected: it adds a call per publication outside the budget of ADR 0059, and the owner ruled out a critic step for now ([model benchmark plan](../test/model-benchmark-plan.md)).

## Decision

- **Blocking: generic customers.** `extraction.generic_customer_terms` is a configured list of generic parties. The first list is `users`, `end users`, `people`, `persons`, `individuals`, `humans`, `everyone`, `society`, and `the public`.
  - The check normalises `Customer` as in [0064](0064-quote-check-after-normalisation.md), lowercases it, and removes a leading `the`, `all`, `many`, or `most`. It matches only when what remains equals a listed term. A qualified party such as `hospital IT administrators` or `bank risk teams` never matches.
  - A match fails the candidate. Before the last attempt the retry names it; on the last attempt the candidate is dropped and listed in `Dropped` (ADR 0064).
  - The list changes by reviewed pull request, like other configuration.
- **Report-only, for now.** These checks are computed and counted in the run report and the eval report, but they do not fail a candidate:
  - `CustomerQuote` shares at least one content word (not a stop word) with `Customer`, after normalisation;
  - from phase 3, the industry of Problem Discovery's `Customer.Industry` is one of the industries the topic map gives the publication.
- **Promotion.** A report-only check becomes blocking by a later ADR, once the golden sets show it has no false positive on the expected candidates.

## Consequences

- REQ-PROC-009 AC4 is enforced by code as well as by the prompt and the eval.
- The first list is short on purpose. A missed generic party is still caught by the eval on the golden set, and the list grows from the run report's counts.
- The report-only checks show their hit rates before anyone relies on them.
