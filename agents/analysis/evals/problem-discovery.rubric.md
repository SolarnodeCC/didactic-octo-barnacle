# Problem Discovery fact rubric

Rubric version: pd-facts@1

The judge of the Problem Discovery eval reads this rubric (ADR 0093, OQ-020). It decides, for each required fact of a golden-set entry, whether a Problem Discovery output states it. Code checks the customer industry and the PainLevel range; the judge decides only the facts.

- A fact is **present** when the output's `Problem`, `Customer`, or `PainRationale` states the same fact, in any words. A wording that is more general or more specific but keeps what the fact says counts.
- A fact is **absent** when the output leaves it out, contradicts it, or states only a part of it that changes its meaning.
- Judge only what the output states. Do not judge whether the fact is true, and do not credit a fact that the output merely makes plausible.
- Give one verdict per fact, in the order given, with a reason of at most 200 characters.

Before the judge decides an eval, its verdicts are compared with the owner's on at least 20 outputs; it is used only when they agree on at least 90 % of the facts. The agreement is recorded below.

## Calibration

Not yet run.
