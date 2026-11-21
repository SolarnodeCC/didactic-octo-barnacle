---
title: "0110: Fact judge round three: not calibrated on fresh outputs"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-19
related: [REQ-AGENT-002, REQ-TEST-005]
---

# 0110: Fact judge round three: not calibrated on fresh outputs

- Decision status: Accepted
- Date: 2026-11-19
- Changes: the calibration record in `agents/analysis/evals/problem-discovery.rubric.md`. No requirement, prompt, rubric text, golden-set, or threshold changes.

## Context

Round two of the calibration ([ADR 0109](0109-fact-judge-rubric-pd-facts-4.md)) reached 84 % with `pd-facts@4`, but the rubric was written after the owner's grades and the owner had graded 37 of 38 facts present, so it could not show that the judge catches a missing fact. The owner chose, on 2026-11-14 after a question-and-answer review, a third round on fresh outputs with the rubric frozen:

- Problem Discovery ran once per candidate on 14 November 2026 from `main` at the merge of ADR 0109 (`bench-2026-11-14T13-58-59-023Z`, Gemma with thinking off, 81.8 % on the code checks; `bench-2026-11-14T13-59-01-957Z`, DeepSeek, 78.8 %; EUR 0.06 with the judge).
- Ten entries the owner had not graded were drawn with seed 20261114 (012, 014, 016, 019, 028, 029, 030, 031, 032, 034), one output of each candidate per entry: 20 outputs, 38 facts, shuffled and shown without the model.
- The judge, `claude-haiku-5-5` with `pd-facts@4`, graded them before the owner did (20 calls, EUR 0.0043, run `calibration-2026-11-14-r3`); the owner then graded them blind.

## Result

The judge agreed with the owner on 26 of 38 facts (68 %). The owner graded 11 facts absent, the judge 7. Of the 12 disagreements, the judge credited 8 facts the owner graded absent, among them 019 fact 2 and 031 fact 2 in both outputs and 012 fact 2 in both, and missed 4 the owner credited, among them both facts of one output of 014. With the rubric frozen this figure is not an upper estimate.

## Decision

- The judge is not calibrated. It stays report-only and FACTS_GATE stays off, as ADR 0093 requires below 90 %.
- `pd-facts@4` stays the rubric; it is not revised after these grades.
- Problem Discovery keeps its provisional model ([ADR 0096](0096-analysis-round-one-results.md)), chosen on the code checks only.

## Consequences

- Three rounds have not brought the judge to 90 %: 68 % on the pilot outputs, 74 % and 84 % (an upper estimate) on the reworked facts, and 68 % on fresh outputs with a frozen rubric. Another rubric wording is unlikely to close the gap; what follows is the owner's choice between another judge model, the owner's own grading of a sample, or settling Problem Discovery on the code checks.
