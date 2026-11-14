---
title: "0109: Fact judge rubric pd-facts@4; the judge stays report-only"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-14
related: [REQ-AGENT-002, REQ-TEST-005]
---

# 0109: Fact judge rubric pd-facts@4; the judge stays report-only

- Decision status: Accepted
- Date: 2026-11-14
- Changes: `agents/analysis/evals/problem-discovery.rubric.md` (rubric `pd-facts@4` and its round-two calibration). No requirement, prompt, golden-set, or threshold changes.

## Context

After the required facts were reworded as the customer's pain ([ADR 0108](0108-problem-discovery-facts-state-the-pain.md)), the owner graded the 9 reworded facts again on the 20 pilot outputs of the first calibration ([ADR 0095](0095-fact-judge-not-calibrated.md)) and kept the 20 earlier grades of unchanged facts: 38 facts. The judge, `claude-haiku-5-5` through the Unified Billing route of `roi-staging`, graded the same facts.

With `pd-facts@3` the judge agreed with the owner on 28 of 38 facts (74 %). All ten disagreements were facts the owner graded present and the judge absent. Six of them are kept facts that the output states as a need, an obligation, or a cause rather than as the pain (002 fact 1, 008 fact 1 twice, 010 fact 1, 011 fact 2 twice): the owner credited them, while the judge applied the rule that a cause is never the pain.

## Options considered

1. **Relax the rubric so a stated fact counts whatever role the output gives it.** Chosen.
2. **Reword the remaining need and cause facts as pains and grade again.** Declined by the owner.
3. **Record the 74 % only.** The owner's own grades credit those facts, so the rule disagreed with the owner's reading.

## Decision

The owner chose, on 2026-11-14, after a question-and-answer review:

- **Rubric `pd-facts@4`**: a fact is present when the output states it in any wording that keeps what it says, whether as the customer's pain, as a cause of the pain, or as its context; it is absent when the output leaves it out, contradicts it, or states only a part that changes its meaning. The rule "a cause is never the pain" of `pd-facts@3` is withdrawn.
- With `pd-facts@4` the judge agreed with the owner on 32 of 38 facts (84 %), with one fact the judge called present and the owner absent, and five the other way, four of them on the reworded facts of 001, 007, and 009.
- **The judge stays report-only and FACTS_GATE stays off**: 84 % is below the 90 % that ADR 0093 requires.
- **No negative controls for now.** The owner graded 37 of the 38 facts present, so this sample cannot show that the judge catches a missing fact; the owner decides later whether the next calibration adds fresh outputs where facts are missing.

## Consequences

- `pd-facts@4` was written after the owner's grades of these outputs, so its 84 % is an upper estimate; the rubric records it as such.
- Problem Discovery keeps its provisional model ([ADR 0096](0096-analysis-round-one-results.md)), chosen on the code checks only.
- The two judge runs cost EUR 0.0129 (40 calls) by the judge's own price record, metadata runs `calibration-2026-11-14` and `calibration-2026-11-14-v4`.
