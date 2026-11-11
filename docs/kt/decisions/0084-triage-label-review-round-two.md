---
title: "0084: Round-two review of the triage golden-set labels"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-PROC-008, REQ-TEST-005, REQ-TEST-006]
---

# 0084: Round-two review of the triage golden-set labels

- Decision status: Accepted
- Date: 2026-11-11
- Changes: 9 triage labels, the basis of 9 more, the extraction golden set (two entries added, one removed), and three analysis entries removed. No requirement and no prompt changes.

## Context

In round one of the benchmark ([ADR 0082](0082-benchmark-round-one-selects-no-model.md)) 27 of the 91 triage entries failed in all six runs of both candidates, and in 23 cases both candidates contradicted the same label in every run. The owner chose a review of these labels for round two, done as [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md) sets out: an agent drafts, a blind second agent of another model family cross-checks, and the owner confirms every change.

- The drafting agent read each contested signal against the [signal table](../agents/triage.md#signals).
- The cross-check was `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (no round-two candidate), given the prompt `triage@2` with only the title and abstract, at temperature 0, through `roi-staging` (USD 0.01). It sided with the candidates against the label on 18 of the 23 contested signals.

## Decision

The owner confirmed on 2026-11-11:

- **Six labels changed** where the draft, the cross-check, and both candidates agree: `gs-triage-007` and `gs-triage-010` `existingAlternative` to false (an absence of infrastructure, and a part of the proposed system, are not what the party does today); `gs-triage-026` and `gs-triage-019` `statedHarm` to false (no cost, delay, loss, or risk is stated); `gs-triage-041` and `gs-triage-057` `existingAlternative` to true (the current legal framework, and a manual process, which the table counts). `gs-triage-057` is now accepted and `gs-triage-019` rejected.
- **`StatedHarm` is read on its own.** A stated cost, delay, loss, or risk counts whoever carries it; whether a party is named is the question of `NamedParty`. `gs-triage-008`, `gs-triage-070`, and `gs-triage-040` change to true; `gs-triage-010` and `gs-triage-075` stay true. `gs-triage-040` is now accepted.
- **A method is not `Adoptable`.** A method, framework, or model evaluated on benchmarks, with or without released code, does not count unless the text offers it as a system, protocol, or tool for an organization to use. The seven labels stay false (`gs-triage-001`, `003`, `008`, `027`, `031`, `034`, `083`); their basis now says why.
- **Three labels kept** against the candidates and the cross-check, each by an explicit exclusion of the table, with the basis made explicit: `gs-triage-014` and `gs-triage-020` `statedHarm`, `gs-triage-075` `existingAlternative`.
- **The extraction set follows the accepted triage set** (scripts/check-golden-sets.py): `gs-extraction-039` (for `gs-triage-057`) and `gs-extraction-040` (for `gs-triage-040`) are added with one primary candidate each, drafted and confirmed in the same way; `gs-extraction-004` (for `gs-triage-019`) is removed with the three analysis entries built on its candidate (`gs-problem-discovery-004`, `gs-relevance-004`, `gs-research-analyst-004`).

## Consequences

- The triage set has 91 entries, 39 of them accepted; the extraction set has 39 entries; the three analysis sets have 34 entries each, above the minimum of 20.
- Round-one pass rates are not comparable with round two on the changed entries; round two runs on the reviewed set.
- The reading of `StatedHarm` and `Adoptable` is recorded in [golden sets](../test/golden-sets.md) for future labels. The signal table and the prompt `triage@2` are unchanged; if candidates keep reading methods as adoptable in round two, sharpening the table is the next option.
