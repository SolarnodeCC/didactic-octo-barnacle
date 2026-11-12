---
title: "0095: The fact judge is not calibrated; its verdicts are reported only"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-12
related: [REQ-AGENT-002, REQ-TEST-005]
---

# 0095: The fact judge is not calibrated; its verdicts are reported only

- Decision status: Accepted
- Date: 2026-11-12
- Changes: the pass rule of the Problem Discovery eval of [ADR 0093](0093-analysis-agents-benchmark.md) for its first round; the rubric becomes `pd-facts@3`. No requirement changes.

## Context

ADR 0093 lets the fact judge decide Problem Discovery entries only after it agrees with the owner on at least 90 % of the required facts of at least 20 outputs. On 2026-11-12 the owner graded the 40 facts of 20 pilot outputs, blind to the judge and the model. The judge with rubric `pd-facts@1` agreed on 24 (60 %); 15 of the 16 disagreements were facts the judge found present and the owner absent.

The owner's rule is stricter than `pd-facts@1`: a fact counts only when the output states it as the customer's pain itself, what goes wrong for the customer or what it costs them; a cause of the pain never counts, even in the same words. Written into the rubric, that rule raised the agreement to 62 % (`pd-facts@2`) and 68 % (`pd-facts@3`, "a cause is never the pain"), measured on the same outputs it was written from, so an upper estimate. Many required facts of the golden set are themselves causes ("the evidence is fragmented across incompatible incident repositories and legal texts"), which this rule never credits.

## Options considered

1. **Run the round now, with the facts not gating.** Chosen by the owner.
2. Review the required facts first, then calibrate on fresh outputs, then run.
3. Return to `pd-facts@1` and have the owner grade again by that rule.
4. Defer Problem Discovery to a later round.

## Decision

- The judge's verdicts are reported and do not decide pass or fail (`FACTS_GATE` off in `agents/extraction/src/analysis/eval.ts`). A Problem Discovery entry passes on the code checks: the schema, the expected customer industry, and PainLevel in the expected range. An absent fact or a judge error is listed in the entry's failures without failing it.
- The rubric is `pd-facts@3`, the closest to the owner's rule; its calibration record is in `agents/analysis/evals/problem-discovery.rubric.md`.
- Next, the required facts of the Problem Discovery golden set are reviewed so that each states a pain rather than a cause, with a blind cross-check and the owner's confirmation (ADR 0072). The judge is then calibrated again, on fresh outputs, and decides only once it reaches 90 %.

## Consequences

- The first round's Problem Discovery pass rate measures the customer industry and the pain level only. The report gives the facts present per run beside it, labelled as not deciding.
- A model chosen for Problem Discovery on this round is chosen without the fact check. The ADR that selects it says so, and the choice is reviewed once the judge decides.
