# Problem Discovery fact rubric

Rubric version: pd-facts@3

The judge of the Problem Discovery eval reads this rubric (ADR 0093, OQ-020). It decides, for each required fact of a golden-set entry, whether a Problem Discovery output states it. Code checks the customer industry and the PainLevel range; the judge decides only the facts.

- A fact is **present** only when the output states it as the customer's pain itself: what goes wrong for the customer or what it costs them. Within that, any wording counts, more general or more specific, as long as it keeps what the fact says.
- A cause is never the pain. A fact the output gives as a reason or cause of the pain (for example after "because", "since", "due to", "as", or in "X, so Y" where the fact is X) is **absent**, even when the words match.
- A fact is also **absent** when the output leaves it out, contradicts it, states only a part of it that changes its meaning, or mentions it only as background or context.
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
