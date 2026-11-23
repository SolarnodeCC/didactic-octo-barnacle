---
title: Phase 2 model calls
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-AGENT-008, REQ-AGENT-009, REQ-PROC-001]
---

# Phase 2 model calls

Part of the [phase 2 design](design.md): how every model and embedding call is made, recorded, and checked. Moved out of the design file in WP5 to keep it within the size limit.

`callModel` is the only way to call a model (REQ-NFR-003 AC1). It takes the step, the agent when one applies, the run, the model configuration, the prompt, the contract schema, and the text the output must quote from. For each call it:

1. Checks the daily budget at the first attempt of a step, never on a retry, so a step that has started finishes (REQ-NFR-005 AC2).
2. Calls the Workers AI binding with the environment's AI Gateway and request metadata: run ID, step, and agent (REQ-NFR-003 AC2, ADR 0054).
3. Applies the two code repairs (`repairModelOutput`), validates the contract, and checks every quote against the input text. A failure is retried with the validation errors, up to `model.max_attempts`. A 429 or 5xx is retried with backoff and `Retry-After` and counts toward the same limit.
4. Writes one `model_call` row per attempt: input tokens with the cached part, output tokens, latency, cost as `Money`, `price_table_version`, `estimated`, and the outcome (`ok`, `invalid-output`, `provider-error`). The row never holds prompt or publication text (REQ-NFR-011).
5. Adds the cost to `budget_day` in the same batch.

Implementation (WP2): `callModel` in `packages/models/src/call-model.ts`, with the binding interface and error classes in `workers-ai.ts` and `FakeWorkersAi` for tests. The D1 store that writes `model_call` and `budget_day` in one batch is `apps/pipeline/src/store/model-usage.ts`. Further rules:

- The price tables are `infrastructure/cloudflare/prices/<version>.json`: list prices in US dollars and the euro exchange rate of that day. A model whose list price has a cached-input price carries it as `CachedInputUsdPerMillionTokens`; the cost is uncached input tokens at the input price, plus cached input tokens (`usage.prompt_tokens_details.cached_tokens`) at the cached price, plus output tokens at the output price (ADR 0078). A published table is never changed; new prices get a new version. Costs are recorded in euro, the currency of the daily budget, rounded to 1e-8. A model with no price in the configured table is refused before the first call, so every record carries a cost.
- Quotes and other item checks (WP7, ADR 0064, ADR 0066): `normalizeForQuote` and `findQuoteSpan` are in `packages/models/src/quote.ts`, and `scripts/check-golden-sets.py` mirrors them, held equal by the shared cases in `packages/models/test-fixtures/quote-normalisation.json`. A step passes `ItemChecks` to `callModel`; a failure is retried with the candidate and field named. When the last attempt is schema-valid and fails only those checks, the failure result also carries `Checked` with that output, and the extraction step applies `applyExtractionChecks` (`packages/models/src/extraction.ts`): it drops the failing candidates into `Dropped`, keeps the others, and replaces each kept quote with the matched source span.
- The binding returns no gateway cost, so every record is `estimated` with the table version (ADR 0054). Checked on 2026-11-10 with two `extraction@2` calls of `deepseek-v4.1-flash-1017` on golden-set entry `gs-extraction-001`, through the `AI` binding (`wrangler dev`, where the AI binding always runs remotely) and the gateway `roi-staging`:
  - The response has `id`, `object`, `created`, `model`, `choices`, and `usage`, and no cost field.
  - `usage.prompt_tokens_details.cached_tokens` is present (704 of 828 input tokens on both calls), so `CachedInputTokens` comes from the binding as it does from the REST API (ADR 0078).
  - The estimate of each record equals the cost the gateway logged for the same call (USD 0.0022986240 and 0.0018582240), and `aiGatewayLogId` gives the gateway log ID that `gateway_request_id` stores, so a later job can match estimated records to the gateway logs by request ID (ADR 0054).
  - The first `evals` calls repeat this check (ADR 0078).
- A 429, a 5xx, or an error with no status is retried with exponential backoff from 500 ms, capped at 30 s, or after `Retry-After` when that is longer. Any other 4xx, such as 410 for a deprecated model, fails the step at once.
- A retry after invalid output adds the previous answer and the validation errors to the messages (REQ-AGENT-009 AC1).

In phase 2 the model queue's concurrency (8, equal to `model.semaphore_max`) is the global limit on calls in flight. The Durable Object semaphore of ADR 0017 arrives in phase 3, when candidate Workflows also call models.
- Embedding calls (WP5): `callEmbedding` in `packages/models/src/embedding.ts` embeds a whole batch in one call. It uses the same gateway options, budget check, retries, and one `model_call` row per attempt as `callModel`, with `PromptVersion` null and no output tokens. When the binding reports no usage, the input tokens are estimated at four characters per token.
