---
title: "0117: A daily review queue, error tags, and structured corrections"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-REV-006, REQ-REV-007, REQ-REV-008, REQ-TEST-005, REQ-TEST-006, REQ-NFR-023]
---

# 0117: A daily review queue, error tags, and structured corrections

- Decision status: Accepted
- Date: 2026-11-24
- Builds on: [ADR 0116](0116-owner-review-frontend.md)

## Context

The first version of the owner review tool (ADR 0116) lists every triaged publication, up to 4,634 on a measured day, and records a verdict as correct, incorrect, or unsure with free text. The owner has about a quarter of an hour a day. A flat list does not say what to look at, and free text cannot be counted per error kind, compared across prompt versions, or turned into a golden-set entry without retyping.

## Options considered

1. **Keep the list; add filters.** Cheap, but the owner still picks items by hand, and the picks bias the agreement rate.
2. **Review a random sample.** Unbiased, but most items are easy accepts and spend the owner's time on little information.
3. **A small stratified daily sample, with error tags and structured corrections.** Chosen.

## Decision

- **Daily queue.** Each decision day has a sample of `review.daily_sample` publications (default 20), drawn once with a generator seeded by the day, so every reload shows the same items. Strata are filled in this order, each up to its share: new prompt version (20 %), borderline triage within one signal of the cut (25 %), accepted with no candidates (15 %), extraction confidence below 0.5 (15 %), model rejection (10 %); random items fill the rest and keep a share of ordinary output in every sample. On a fresh database every prompt version is new, so the new-prompt stratum stays empty until there is an older version to compare with. A sample opened before the day's run ends is topped up later; items already in it never change.
- **Error tags.** An incorrect or unsure verdict can carry tags from a fixed, versioned list (`tags-v1`): for triage `should-accept`, `should-reject`, `wrong-signal`; for a candidate `quote-does-not-support`, `customer-wrong`, `not-a-real-problem`, `duplicate`, `overstated`, `why-now-or-alternative-wrong`. A correct verdict has none.
- **Structured corrections.** A triage verdict can carry the five signals as the owner reads them; the tool previews the score and decision with the pipeline's rule. A candidate verdict can carry corrected finding, customer, and quotes; a corrected quote must occur in the abstract when extraction read the abstract.
- **Undo.** Undo withdraws the current verdict instead of deleting it; the newest verdict that is not withdrawn is current. History stays complete.
- **Keyboard flow.** `1` saves correct and moves to the next item without a verdict; `2` and `3` open the reasons, toggled by one letter, saved with Enter; `a` marks every remaining item correct; `u` undoes; `?` lists the keys. A publication whose items all have a verdict hands over to the next open one in the queue.

## Consequences

- REQ-REV-006 to REQ-REV-008 describe the behaviour; migration 0015 adds `output_review.tags_json`, `output_review.corrected_json`, `output_review.withdrawn_at`, and the `review_sample` table. The planned thin-slice migration moves to 0016.
- The agreement rate of a day mixes strata on purpose. Insights per stratum, golden-set drafts from corrections, and agreement in the daily quality section (ADR 0115) are planned as REQ-REV-010 and REQ-REV-011.
- The tag list and the triage rule are repeated in the browser bundle, which imports only types from `packages/models`; unit tests keep both copies equal.
