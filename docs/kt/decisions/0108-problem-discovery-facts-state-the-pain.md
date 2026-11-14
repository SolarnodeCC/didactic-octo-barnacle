---
title: "0108: Problem Discovery facts state the customer's pain"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-14
related: [REQ-AGENT-002, REQ-TEST-005]
---

# 0108: Problem Discovery facts state the customer's pain

- Decision status: Accepted
- Date: 2026-11-14
- Changes: the required facts of 28 entries and the customer industry of `gs-problem-discovery-010` in `agents/analysis/evals/problem-discovery/`. No requirement, prompt, rubric, or threshold changes.

## Context

The fact judge of Problem Discovery is not calibrated: it agreed with the owner on at most 68 % of 40 facts, against the 90 % required, so FACTS_GATE is off and the provisional choice of Gemma rests on the code checks only ([ADR 0095](0095-fact-judge-not-calibrated.md), [ADR 0096](0096-analysis-round-one-results.md)). Rubric `pd-facts@3` holds the owner's rule that a cause is never the pain. Many required facts were causes, background, requirements, or research results, so under the owner's own rule no output could state them as a pain. In the calibration the owner had graded such facts absent in every output (for example 001 fact 2, 003 fact 2, 008 fact 2, 010 fact 2).

## Review

The facts were reviewed under [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md). Claude classified each of the 66 facts as pain, cause, context, need, or solution, and reworded each non-pain fact as the pain it produces for the named customer where the abstract supports one, or dropped it where it does not. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, not a candidate, classified the original facts blind and checked each rewording for being a pain and being supported (63 calls, USD 0.0145, metadata `Agent: pd-fact-kind` and `pd-fact-check`):

- It agreed with the draft on whether a fact is a pain for 52 of 66 facts. On five of the fourteen it disputed (002 fact 2, 007 fact 1, 008 fact 2, both facts of 011) the owner's own calibration grades already treated the facts as the draft does; on the other nine the owner kept the draft.
- It found all 27 rewordings supported by the abstract, and three of them not a pain (017 fact 1, 019 fact 2, 032 fact 2); the owner chose revised wordings for those three.

## Decision

The owner chose, on 2026-11-14, after a question-and-answer review:

- **27 facts are reworded** as the customer's pain, for example "the evidence is fragmented across incompatible incident repositories and legal texts" becomes "deployers struggle to assemble the evidence a credible assessment needs".
- **6 facts are dropped** because the abstract supports no pain beyond the entry's other fact: 006 fact 2, 018 fact 2, 023 fact 2, 026 fact 1, 030 fact 1, and 035 fact 2. Those six entries keep one required fact; the set holds 60.
- **`gs-problem-discovery-010` names `other`** as the customer industry: radiologists are care providers, as `research-analyst@2` and the golden-set README have it ([ADR 0100](0100-analysis-rerun-and-industry-rules-in-the-prompts.md), [ADR 0101](0101-analysis-round-three-results.md)).
- **The judge is calibrated again on the old outputs.** The owner keeps the 20 earlier grades of unchanged facts and grades the nine reworded facts on the same 20 pilot outputs again (18 grades, the dropped fact of 006 needs none). The judge is then compared with the owner on those 38 facts; it decides an eval only at 90 % agreement or more.

## Consequences

- Until the calibration is recorded in the rubric, the judge stays report-only and FACTS_GATE stays off.
- Each changed entry's notes name the review. The reworded facts are what the judge will check once FACTS_GATE is on, so a later Problem Discovery run measures pains, not causes.
