# Problem Discovery fact rubric

Rubric version: pd-facts@4

The judge of the Problem Discovery eval reads this rubric (ADR 0093, OQ-020). It decides, for each required fact of a golden-set entry, whether a Problem Discovery output states it. Code checks the customer industry and the PainLevel range; the judge decides only the facts.

- A fact is **present** when the output states it, in any wording, more general or more specific, as long as it keeps what the fact says. It counts whether the output gives it as the customer's pain, as a cause of the pain, or as its context.
- A fact is **absent** when the output leaves it out, contradicts it, or states only a part of it that changes its meaning.
- Judge only what the output states. Do not judge whether the fact is true, and do not credit a fact that the output merely makes plausible.
- Give one verdict per fact, in the order given, with a reason of at most 200 characters.

Before the judge decides an eval, its verdicts are compared with the owner's on at least 20 outputs; it is used only when they agree on at least 90 % of the facts. The agreement is recorded below.

## Calibration

Recorded 2026-11-12 (ADR 0095). The owner graded the 40 required facts of 20 pilot outputs (the first 10 entries, one output each of `gemma-4-26b-a4b-it` with thinking off and `deepseek-v4.1-flash-1017`, benchmark `bench-2026-11-12T08-23-33-313Z`), blind to the judge and to the model.

| Rubric | Agreement with the owner | Judge present, owner absent | Owner present, judge absent |
|---|---|---|---|
| `pd-facts@1` | 24 of 40 (60 %) | 15 | 1 |
| `pd-facts@2` (the fact must be part of the customer's problem) | 25 of 40 (62 %) | 13 | 2 |
| `pd-facts@3` (a cause is never the pain) | 27 of 40 (68 %) | 7 | 6 |

`pd-facts@2` and `@3` were written from the owner's grades of these same outputs, so their agreement is an upper estimate. No version reaches 90 %, so the judge does not decide an eval: its verdicts are reported only.

### Round two

Recorded 2026-11-14 (ADR 0108, ADR 0109). The required facts were reworded as the customer's pain (ADR 0108). On the same 20 outputs the owner kept the 20 earlier grades of unchanged facts and graded the 9 reworded facts again (18 grades), 38 facts in all; the dropped fact of entry 006 has none. The owner graded 37 of the 38 present.

| Rubric | Agreement with the owner | Judge present, owner absent | Owner present, judge absent |
|---|---|---|---|
| `pd-facts@3` | 28 of 38 (74 %) | 0 | 10 |
| `pd-facts@4` (a fact counts as pain, cause, or context) | 32 of 38 (84 %) | 1 | 5 |

`pd-facts@4` was written after the owner's grades of these outputs, so its agreement is an upper estimate. With 37 of 38 facts present, a judge that always answered present would agree on 37; this sample cannot show that the judge catches a missing fact. Neither version reaches 90 %, so the judge still does not decide an eval.
