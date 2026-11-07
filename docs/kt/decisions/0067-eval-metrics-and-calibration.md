---
title: "0067: Eval metrics and calibration; Confidence stays out of decisions"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-TEST-007, REQ-TEST-006, REQ-PROC-008, REQ-PROC-009, REQ-TEST-004]
---

# 0067: Eval metrics and calibration; Confidence stays out of decisions

- Decision status: Proposed
- Date: 2026-11-07
- Answers: none
- Changes: new REQ-TEST-007; [AI evals](../test/ai-evals.md), [golden sets](../test/golden-sets.md), and the Confidence section of [contract conventions](../agents/contract-conventions.md)

## Context

With no person reviewing pipeline output, the evals are the only check that triage and extraction decide correctly, so their report has to show where a model goes wrong, not only whether it passed. The eval runner in `agents/extraction/src/eval.ts` gives the entry pass rate, agreement per triage signal, and the precision and recall of the accept decision. The 2026-11-07 review of the agent chain found these gaps:

- Triage has no decision accuracy, F1, or confusion matrix, and no breakdown per industry: triage golden entries carry no industry field.
- Extraction requires the candidate count to match exactly, so an entry with two of three expected candidates and one with none score the same. There is no candidate-level precision or recall.
- There is no rate of quotes that pass on the first attempt, so a model that paraphrases is visible only as failed entries.
- The [contract conventions](../agents/contract-conventions.md) say evals check that `Confidence` is calibrated, but no metric is defined, and no decision reads `Confidence`.
- Stability over three runs is described in [AI evals](../test/ai-evals.md) but not built.

## Options considered

1. **Add report-only metrics and keep the approved thresholds and pass rule.** Chosen.
2. **Change the pass rule to the new metrics now.** Rejected: the thresholds were approved before the first run on purpose (REQ-TEST-006 AC4) and are reviewed once with data.
3. **Self-consistency: run each step several times and vote.** Rejected for the pipeline: it multiplies calls against the 20 requests a minute of Workers AI and the budget of ADR 0059, and the owner ruled out a critic step for now. Stability over three runs stays an eval check only.

## Decision

- **The eval report adds, without changing the pass rule:**
  - triage: confusion matrix and accuracy, precision, recall, and F1 of the accept decision, next to agreement per signal;
  - a breakdown of these per industry. Triage golden entries gain an `industry` field like extraction entries;
  - extraction: candidate matching with partial credit. An expected and a returned candidate match when their normalised evidence quotes overlap (ADR 0064). The report gives candidate precision, recall, and F1, and the accuracy on entries that should yield no candidate;
  - quotes: the share that pass on the first attempt, the share that match only after normalisation, and the share of candidates dropped;
  - where accepted quotes fall in the input text, by tenth of its length, to show whether the full-text cut loses evidence (ADR 0065);
  - stability: over three runs, agreement of the accept decision and the signals, and of the candidate count.
- **Calibration.** `Confidence` stays out of every decision. The report gives the Brier score of extraction `Confidence` against entry pass, and checks that entries in the top third of `Confidence` pass at least as often as entries in the bottom third. A full expected calibration error is not used: at 20 to 91 entries it is too noisy.
- **Optional candidates.** A golden extraction entry may mark an expected candidate `optional: true`. Missing it does not lower recall, and finding it does not lower precision. The flag is used at the threshold review; until then the entry pass rule counts every candidate.
- The new fields reach the golden-set files and `scripts/check-golden-sets.py` in WP6 (triage `industry`) and WP7 (`optional`).

## Consequences

- A model that fails one industry or one signal, or that paraphrases, is visible in the eval report before it reaches the pipeline.
- The model benchmark (OQ-036) can compare candidates on F1 and calibration as well as on the pass rate, while the decision rule of the [model benchmark plan](../test/model-benchmark-plan.md) stays the same.
- If `Confidence` turns out to be calibrated, a later ADR can use it; until then no decision depends on a number that has not been measured.
