---
title: "0072: One owner reviews the golden sets, with agents to draft and cross-check"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-TEST-005, REQ-TEST-006, REQ-SCORE-006]
---

# 0072: One owner reviews the golden sets, with agents to draft and cross-check

- Decision status: Accepted
- Date: 2026-11-07
- Answers: OQ-015
- Changes: criterion 2 of REQ-TEST-005 and REQ-TEST-006, the reviewer slots of [golden sets](../test/golden-sets.md), and [AI evals](../test/ai-evals.md)

## Context

OQ-015 asked for ten named reviewers: one per target industry and two for a shared sample. REQ-TEST-005 and REQ-TEST-006 asked for entries "reviewed by someone with knowledge of that industry". The project has one owner, `@SolarnodeCC`, who already labeled the triage and extraction sets. The reviewers exist to give the evals independent human ground truth, and an agent cannot be an independent expert. An agent from the same model family as the model under test would also favor it.

## Options considered

1. **The owner reviews, and agents draft and cross-check.** Chosen.
2. **Recruit eight industry experts now.** Not possible for a one-person business before there are customers or advisors.
3. **Agents review, the owner signs off in bulk.** The labels would then rest on the agents' judgment, which is what the evals test.

## Decision

- The owner is the named reviewer of every entry (slots R1 to R8) and of the shared sample (R9). No label counts until the owner has confirmed it.
- Agents may draft and cross-check labels, and never confirm one:
  - A drafting agent proposes each label with its evidence quotes. It is not a candidate in the benchmark.
  - A second agent from a different model family, also not a candidate, labels the same entries without seeing the first agent's labels (slot R10, agreement only).
  - For an entry on which the two agents disagree, the owner decides after reading the source text. For an entry on which they agree, the owner checks a random quarter against the source text and confirms the rest from the evidence quotes.
- The agreement of the owner with the second agent on the shared sample of at least 20 entries is recorded. The owner re-labels a sample of at least 10 entries after at least three days, which measures consistency.
- The calibration ranking of REQ-SCORE-006 is the owner's own ranking. An agent never supplies the reference ranking, because the scores are built from agent output.
- This setup shows that the labels are consistent and checked by the owner. It does not show agreement with independent industry experts, and no document claims that it does.

## Consequences

- OQ-015 is answered. OQ-044 asks which outside experts check the sets before accuracy claims or launch.
- A claim of validated accuracy to customers, and the label `validated` on an opportunity, wait for that outside check (OQ-044).
- The golden-set entries that name the owner as reviewer stay as they are.
