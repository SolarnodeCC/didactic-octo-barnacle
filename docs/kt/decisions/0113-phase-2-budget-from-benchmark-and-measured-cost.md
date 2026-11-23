---
title: "0113: The phase 2 budget is priced from the benchmark cost, then from the measured cost"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-NFR-005, REQ-NFR-019]
---

# 0113: The phase 2 budget is priced from the benchmark cost, then from the measured cost

- Decision status: Accepted
- Date: 2026-11-23
- Changes: where the step costs in the formula of [ADR 0059](0059-phase-2-budget-by-cost-component.md) come from, and when the measured cost of [ADR 0032](0032-phase-1-cost-per-publication-is-an-estimate.md) replaces them ([phase 2 design](../phase-2/design.md#budget))

## Context

ADR 0059 computes the daily budget from the expected daily volumes and a cost per step, and takes each cost from `infrastructure/cloudflare/measure/cost-assumptions.json` until a measured cost replaces it. That file holds placeholder token counts and the prices of models that are no longer configured. The benchmarks have since chosen the triage model (ADR 0088) and the extraction model (ADR 0091), and recorded what each costs per item through AI Gateway. ADR 0032 says the first measured cost replaces the estimate, but not how it is measured. ADR 0059 also names the daily limit `extraction.daily_limit`; the key is `ingestion.daily_extraction_limit`.

## Options considered

1. **Keep `cost-assumptions.json`.** This prices models that do not run, with token counts nobody measured.
2. **A fixed `budget.daily_eur` per environment, changed by pull request.** The cost measured by phase 2 would wait for a person to copy it.
3. **Price each step from its benchmark cost until phase 2 has measured it, then from the measured cost.** Chosen.

## Decision

- **Estimate.** Before a measured cost exists:
  - Triage costs what the benchmark measured: USD 0.0240 over 274 items, USD 0.0000876 per item (ADR 0088).
  - Extraction costs USD 0.2743 over 117 items, USD 0.002344 per item, which was measured on abstracts (ADR 0091). The full-text input that ADR 0059 prices is added on top: `extraction.full_text_max_chars` / 4 tokens, less the mean abstract of 373 tokens, at the input price of `model.extraction`.
  - An embedding is priced at 400 input tokens (the mean abstract plus a title) at the price of the embedding model.
  - US dollars are converted at the rate of the price table, `model.price_table_version`.
  - A configured model with no price in the table stops the Worker from starting, so nothing is guessed.
- **Measured cost.** For each step, the cost of all its `model_call` rows over the `budget.measured_cost_days` (7) complete days before the day, retries included, is divided by the items they served. For triage and extraction an item is a distinct publication. For embedding, where one call embeds a batch, it is an `embedding` row written. The measured cost replaces the estimate of that step once at least `budget.measured_cost_min_items` (20) items are behind it.
- **Per environment.** `budget.expected_daily_triaged` and `budget.expected_daily_embeddings` are Worker variables in `wrangler.toml`, `BUDGET_EXPECTED_DAILY_TRIAGED` and `BUDGET_EXPECTED_DAILY_EMBEDDINGS`. Staging and production use 4,634, the largest measured day. Local and preview use 100.
- **Once a day.** The limit is computed the first time a day is used, stored in `budget_day.limit_amount`, and logged with its three parts and whether each cost was measured. Later calls of the day read the stored limit.
- **Stop and alert.** The call that brings the spend to the limit sets `budget_day.stopped_at`. The first refusal afterwards sets `alerted_at` and sends the day's one `budget-stop` alert (ADR 0055, REQ-NFR-019).
- **Key name.** ADR 0059's `extraction.daily_limit` is `ingestion.daily_extraction_limit`.

## Consequences

- With these costs, staging and production start at about EUR 1.25 a day: triage EUR 0.36, extraction EUR 0.36 with full text priced in, and embeddings EUR 0.11, times 1.5. That is above the provisional EUR 1.01, because the full-text input is now priced in. Local and preview start at about EUR 0.56, most of it the extraction limit.
- From the eighth day of processing, the budget follows what the steps actually cost, without a pull request. A change of model or prompt shows in the budget within a week.
- `budget.daily_eur` is no longer a configured number. The ADR 0023 formula still replaces this one before phase 4 scoring.
