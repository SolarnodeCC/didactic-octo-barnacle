---
title: "0059: Phase 2 budget by cost component"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-NFR-005, REQ-NFR-011]
---

# 0059: Phase 2 budget by cost component

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-043
- Changes: REQ-NFR-005 AC1; supplements OQ-013 and [0032](0032-phase-1-cost-per-publication-is-an-estimate.md)

## Context

OQ-013 set the provisional phase 2 budget to the daily limit (100) times the cost per publication times 1.5, about EUR 0.22 a day. That cost per publication is one triage and one extraction call on the abstract (ADR 0032). Phase 2 also triages every in-scope publication, embeds every publication, and may send full text to extraction. On the largest day measured so far (4,634 publications), triage alone costs about EUR 0.37 at the estimated price, above the whole budget.

## Options considered

1. **Budget per cost component.** Chosen.
2. **Cap the number of publications triaged each day**, which keeps the budget but leaves publications unread.
3. **Raise the flat figure** without a formula behind it.

## Decision

- The daily budget before calibration is:

```text
budget.daily_eur = ( budget.expected_daily_triaged x triage cost
                   + extraction.daily_limit        x extraction cost
                   + budget.expected_daily_embeddings x embedding cost )
                   x budget.phase2_multiplier
```

- `budget.expected_daily_triaged` and `budget.expected_daily_embeddings` come from the measured daily volume in [ingestion scope](../data-sources/ingestion-scope.md). Until a steady state is measured they use the largest measured day.
- The extraction cost is priced with an input of `extraction.full_text_max_chars` when full text is used, and with the mean abstract otherwise.
- Each cost comes from `infrastructure/cloudflare/measure/cost-assumptions.json` until the first measured cost replaces it. An embedding price that is not filled in is reported as missing, never guessed (ADR 0032).
- `budget.phase2_multiplier` stays 1.5. REQ-NFR-005 AC1 is changed to this formula.

## Consequences

- With the prices of 6 November 2026 and without embeddings and full text, the figure is about EUR 0.76 a day on the largest measured day and about EUR 0.21 a day at the mean volume. The embedding price and the full-text input raise it, and both are priced in WP2.
- The budget stop of REQ-NFR-005 AC2 and the daily admission of [0055](0055-daily-admission-and-budget-stop.md) work as before.
- OQ-043 is answered and removed from [open questions](../open-questions.md).
