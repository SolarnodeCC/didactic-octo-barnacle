---
title: "0087: The triage eval passes on the accept decision, with a floor on every signal"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-PROC-008, REQ-TEST-006, REQ-TEST-007]
---

# 0087: The triage eval passes on the accept decision, with a floor on every signal

- Decision status: Accepted
- Date: 2026-11-11
- Changes: REQ-TEST-006 (new AC5), the triage threshold file `agents/extraction/evals/triage.threshold.json`, the pass rule in [AI evals](../test/ai-evals.md) and [golden sets](../test/golden-sets.md#threshold-values), and the evals of [triage](../agents/triage.md#evals)

## Context

Until now a triage entry passed only when all five signals and the derived decision matched the labels (`entry-pass-rate`). In round two of the benchmark no candidate passed more than 54.9 % of the entries on that rule, while the accept decision itself was right on 86.8 % to 87.9 % of the entries for both Gemma variants ([results](../test/benchmark-round-two-results.md)). With five signals each read right about 80 % to 90 % of the time, an entry with all five right is the exception even for a model whose decisions are good.

The pipeline acts on the decision, which code derives from the signals (REQ-PROC-008). The signals still matter: they explain the decision, and a model that reaches the right decision for the wrong reasons would not hold up on new publications. [ADR 0082](0082-benchmark-round-one-selects-no-model.md) named this rule as the owner's decision, and the owner kept the all-five rule for round two, choosing a label review instead ([ADR 0084](0084-triage-label-review-round-two.md)). After round two the owner chose to change it.

## Options considered

1. **Keep all five signals.** Triage stays open, and a round three needs a better model or prompt work on `ExistingAlternative` and `StatedHarm`.
2. **Pass on the decision only**, with signal agreement in the report only. A model could pass with a signal it mostly misreads.
3. **Pass on the decision, with a floor on the agreement of every signal.** Chosen.

## Decision

- **Metric `decision-pass-rate`.** A triage entry passes when the output matches the schema and the decision that `decideTriage` derives from its signals is the labelled one. A signal that differs from its label is still listed as a failure of the entry and counted in the report, but does not fail the entry.
- **Signal floor.** A run passes only when the pass rate meets the threshold (`minimum` 0.85, `tolerance` 0.05, so at least 0.80) and the agreement of each of the five signals with the labels is at least `signalFloor`, 0.80. The report names the signals below the floor.
- The triage threshold file becomes `{ "metric": "decision-pass-rate", "minimum": 0.85, "tolerance": 0.05, "signalFloor": 0.8 }`. Extraction and the analysis agents keep `entry-pass-rate`.
- As before, every run must pass: the threshold applies per run, not to the mean of the runs (the owner confirmed this rule for both steps on 2026-11-11).

## Consequences

- The rule is changed after round two, with its results known. The floor of 0.80 is the owner's choice. Both Gemma variants and `gpt-oss-120b` meet the decision part on every run; only Gemma with thinking off also meets the floor on every run, with its lowest signal, `ExistingAlternative`, at 80.2 %. That margin is one entry of 91, so a later model change or label change can fail it.
- The eval runner (`runTriageEval`) and the benchmark report apply the new rule; the report's "Threshold met in all runs" includes the floor.
- REQ-TEST-007 AC6 still holds: the report-only metrics do not change the pass rule.
