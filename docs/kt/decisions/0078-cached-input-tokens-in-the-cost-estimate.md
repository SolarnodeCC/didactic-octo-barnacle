---
title: "0078: Bill cached input tokens at the cached-input price in the cost estimate"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-10
related: [REQ-NFR-005, REQ-NFR-011, REQ-NFR-020]
---

# 0078: Bill cached input tokens at the cached-input price in the cost estimate

- Decision status: Proposed
- Date: 2026-11-10
- Changes: the price table format and the new table `infrastructure/cloudflare/prices/2026-11-10.json`, `model.price_table_version` in [defaults](../architecture/defaults.md), the `model_call` row of the [phase 2 schema](../phase-2/schema.md) (migration 0010), and the number of the thin-slice migration (now 0011). No requirement changes.

## Context

`callModel` estimates the cost of each Workers AI call from a versioned price table, because the binding returns no gateway cost (REQ-NFR-011 AC2, [ADR 0054](0054-processing-runs-and-model-call-records.md)). The table of 2026-11-06 has one input and one output price per model, and the estimate bills every input token at the input price.

The [Workers AI price list](https://developers.cloudflare.com/workers-ai/platform/pricing/) (last updated 2026-10-20, read again on 2026-11-10) also gives a cached-input price for models with prompt caching: `deepseek-v4.1-flash-1017` costs USD 0.300 per million input tokens, 0.006 per million cached input tokens, and 1.200 per million output tokens. `glm-5.3` has a cached price of 0.260 against 1.400, which the table of 2026-11-06 also lacks. A response reports the cached tokens in `usage.prompt_tokens_details.cached_tokens`; they are a part of `usage.prompt_tokens`.

Round one of the [benchmark](../test/benchmark-round-one.md) sends the same system prompt with every item, so most of an extraction prompt is served from the provider's prompt cache. (`cf-aig-skip-cache` skips the AI Gateway response cache, not the provider's prompt cache.) In the `roi-staging` gateway logs of 2026-11-10:

| Model | Calls | Cached share of input | Old estimate vs logged cost | Estimate of this ADR vs logged cost |
|---|---|---|---|---|
| `deepseek-v4.1-flash-1017` | 136 | 78.0 % (99,264 of 127,302 tokens) | +8.72 % | equal for every call (largest difference USD 1.5e-10) |
| `glm-4.7-flash` | 59 | none reported | -0.13 % | -0.13 % (unchanged) |
| `gemma-4-26b-a4b-it` | 99 | none reported | +0.07 % | +0.07 % (unchanged) |

The small residuals of the two models without a cached price are not caused by caching and are outside this decision: the gateway logged the `glm-4.7-flash` calls at about USD 0.0605 and 0.4004 per million tokens (its neuron prices of the price list) instead of the dollar prices 0.060 and 0.400, and three `gemma-4-26b-a4b-it` calls were logged 2.5 to 5 % below the price of their logged tokens.

## Options considered

1. **A cached-input price in the price table, the cached count in the usage record, and a new table version.** Chosen.
2. **A cached-input price in the table, without the cached count in the record.** No migration, but a stored cost could no longer be recomputed from its row and price table version, and the share of cached input, which drives the cost of the daily budget (ADR 0059), would be visible only in the gateway logs.
3. **Read the cost from the AI Gateway logs after each call.** Exact, but it adds a request per call and a token that may read the logs, and the binding still returns no cost (ADR 0054). It does not remove the need for a price table when the logs are late or unavailable.
4. **Add the cached prices to the table of 2026-11-06.** Rejected: records name the version they were priced with, so a published table must not change.

## Decision

- A model price may carry `CachedInputUsdPerMillionTokens`, never above its input price. A model whose list price has none has no such field.
- `parseGeneration` returns `CachedInputTokens` from `usage.prompt_tokens_details.cached_tokens` (or `usage.input_tokens_details.cached_tokens`), 0 when absent, and never more than the input tokens. The benchmark command keeps the usage object of a streamed response whole, with the details of an earlier event if the final one has none.
- The estimated cost is (input − cached) × input price + cached × cached price + output × output price, in US dollars, converted to euro at the table's rate. Without a cached price, cached tokens are billed at the input price, as before.
- The usage record has `CachedInputTokens`, a part of `InputTokens`. In D1 it is `model_call.cached_input_tokens`, added by migration 0010 (`ALTER TABLE ... ADD COLUMN`, default 0, between 0 and `input_tokens`), an expand-only change (REQ-NFR-020). Rows written before it, and a Worker of the previous version, read 0. The daily totals also sum it.
- Price table `2026-11-10` has the prices of the list read that day, with the cached prices of `deepseek-v4.1-flash-1017` and `glm-5.3`, at the ECB reference rate of 2026-11-09 (USD 1.1193 per EUR), the latest published when the list was read. `model.price_table_version` and the benchmark command default to it. The table of 2026-11-06 stays as it is.

## Consequences

- The estimate of a cached call equals the cost the gateway logs, so the budget of the benchmark and the daily budget (REQ-NFR-005) are no longer overstated by about 9 % for `deepseek-v4.1-flash-1017` extraction.
- The thin-slice migration that ADR 0054 and the build plan called 0010 becomes 0011. Its content does not change.
- The pipeline Workers call Workers AI through the `AI` binding. Whether that response also carries `prompt_tokens_details` is checked on the first `evals` call, together with the gateway cost (ADR 0054). Until then a missing field reads as 0, which bills at the full input price, the safe side for the budget.
- The cost per call in the benchmark depends on a warm prompt cache. Production sends the same system prompt for every publication of a step, so the cached share there is expected to be similar; the measured share replaces the placeholder tokens of `cost-assumptions.json` when OQ-036 is closed.
- A new price list needs a new table version. A model that gains a cached price gets it in that version.
