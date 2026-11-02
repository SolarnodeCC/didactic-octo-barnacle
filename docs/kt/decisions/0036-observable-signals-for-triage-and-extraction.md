---
title: "0036: Decide triage and extraction from observable signals"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-02
related: [REQ-PROC-004, REQ-PROC-005, REQ-PROC-006, REQ-PROC-008, REQ-PROC-009, REQ-TEST-005]
---

# 0036: Decide triage and extraction from observable signals

- Decision status: Accepted
- Date: 2026-11-02

## Context

Triage asks a small model for the likelihood of a software opportunity, and extraction asks for candidate opportunities. Neither criterion says what to look for. A reviewer who labels a golden set and a model that scores a publication can disagree without either being wrong. The first labeling round showed it: the owner reviewed 14 arXiv publications, and five stayed undecided because the criterion could not settle them.

The owner's framework names four elements of an opportunity: an urgent problem, a paying customer, a reachable market, and a reason to win. It adds a "why now" test and a reversal test. Its evidence standards are customer evidence: interviews, letters of intent, and 50 named target customers. A publication cannot hold that evidence, and the [overview](../overview.md) lists customer validation, pricing, and contracts as non-goals of the MVP. Applied as a gate on publications, "no evidence means absent" would reject every publication.

## Options considered

1. **Keep the holistic criterion.** No change. Labels stay hard to agree on, and a small model has nothing concrete to check.
2. **Option A: observable signals in triage and required quoted elements in extraction.** Uses only what a title and abstract can show.
3. **Option B: evidence levels, a validation brief, and a readiness label after the agents.** Four levels per element (E0 absent, E1 assumption, E2 documentary evidence, E3 validated by a person), a brief with a kill question and a stop criterion per element, and a label next to the score. Needs new agent fields and a design of its own.
4. **Option C: the full framework as a gate across the pipeline.** Needs customer evidence the platform cannot produce.

## Decision

Option A now. Option B is designed for phase 3 (OQ-037). Option C is rejected for the MVP.

**Triage.** The model reads five yes/no signals from the title and abstract: `NamedParty`, `StatedHarm`, `Trigger`, `ExistingAlternative`, and `Adoptable`. Plain code sets `TriageScore` to the number of true signals divided by five and decides: a publication is accepted when `NamedParty` and `StatedHarm` are both true, the score is at or above `triage.accept_score_cut`, and the daily limit is not reached. With the default cut of 0.55, three true signals pass (0.6) and two fail (0.4). The signal definitions are in [triage](../agents/triage.md) (REQ-PROC-008).

**Extraction.** Every candidate names a `Customer` and quotes both the problem and the customer from the text. `WhyNow` and `CurrentAlternative` are optional and quoted, and stay empty when the text does not name them. A candidate without a quotable problem and customer is not returned (REQ-PROC-009).

**Strictness.** These choices set how strict the rule is. The owner confirmed them on 2026-11-02:

- `NamedParty` needs a role or organization type in the text. A generic or implied party does not count.
- `StatedHarm` needs a cost, delay, loss, or risk stated in the text. A number is a plus and not required.
- Three of five signals, with `NamedParty` and `StatedHarm` required.
- Ties above the daily limit break by publication date (newest first), then by publication ID, so a run is repeatable.

## Consequences

- Golden-set triage entries record the expected value of each signal. The eval reports agreement per signal, which is easier to label and to compare across models than one holistic judgment.
- The model no longer returns `TriageScore` or `Accepted`; code derives them. REQ-PROC-004, REQ-PROC-005, and REQ-PROC-006 stay valid and unchanged. REQ-PROC-008 and REQ-PROC-009 add the new behavior.
- A stricter triage accepts fewer publications. Extraction empties come from the second, stricter reading, so the golden set needs entries that pass triage and yield no candidate (REQ-TEST-005).
- The platform still collects no evidence for payment, a reachable market, or a reason to win at triage or extraction. Later agents with the search tool (ADR 0013) and Option B address that.
- The labels of the first round are read again against the signals before they enter the golden set. The [model benchmark plan](../test/model-benchmark-plan.md) measures triage by agreement per signal.
