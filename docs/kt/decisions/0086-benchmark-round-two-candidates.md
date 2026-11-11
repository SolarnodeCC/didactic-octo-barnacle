---
title: "0086: Benchmark round two candidates, a reasoning variant, and price table 2026-11-11"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-010, REQ-AGENT-014, REQ-NFR-005, REQ-NFR-011, REQ-TEST-006]
---

# 0086: Benchmark round two candidates, a reasoning variant, and price table 2026-11-11

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the candidates of the benchmark command in [running a round](../test/model-benchmark-run.md), an optional reasoning setting in the model configuration of `callModel`, the price table `infrastructure/cloudflare/prices/2026-11-11.json`, and `model.price_table_version` in [defaults](../architecture/defaults.md). No requirement changes.

## Context

Round one qualified no model ([ADR 0082](0082-benchmark-round-one-selects-no-model.md)). Before round two the owner chose: the best candidate of round one per step, `gpt-oss-120b` as a new candidate for both steps, and one alternative reasoning setting for Gemma, whose reasoning often ran to the output limit (the plan's round two, [Method](../test/model-benchmark-plan.md#method) step 5). The labels and the extraction rule changed before the round ([ADR 0084](0084-triage-label-review-round-two.md), [ADR 0085](0085-one-primary-extraction-candidate.md)).

Read on 2026-11-11 from the Workers AI model catalog:

- `@cf/openai/gpt-oss-120b`: 128k context, reasoning and function calling, no planned deprecation, USD 0.35 per million input and 0.75 per million output tokens. Its reasoning has three effort levels and cannot be switched off. A test call with chat messages and a JSON schema through `roi-staging` answered in the schema, streamed in the same chunks as the other candidates, and reported its usage.
- `@cf/google/gemma-4-26b-a4b-it`: reasoning has an on/off switch (`chat_template_kwargs.enable_thinking`) and no effort levels. A test call with thinking off answered in the schema with 10 output tokens and no reasoning. The list now gives it a cached-input price of USD 0.05 per million tokens.
- The list now gives `glm-4.7-flash` USD 0.0605 per million input tokens (the rate ADR 0078 found in the gateway logs) and `bge-base-en-v1.5` USD 0.0666.

## Decision

- **Candidates of round two**, the default of the command:

  | Step | Candidates |
  |---|---|
  | Triage | `gemma-4-26b-a4b-it`, `gemma-4-26b-a4b-it+reasoning=off`, `gpt-oss-120b` |
  | Opportunity extraction | `deepseek-v4.1-flash-1017`, `gpt-oss-120b` |

  `glm-4.7-flash` is dropped, being the weaker triage candidate on every metric of round one. Gemma is dropped from extraction, so its reasoning variant applies to triage only. `gpt-oss-120b` runs at its default effort (medium), the setting that round two compares.
- **A reasoning setting is part of a model's configuration.** `ModelConfig.Reasoning` is either thinking off, sent as `chat_template_kwargs.enable_thinking: false`, or an effort level, sent as `reasoning.effort`. Without it the model keeps its default. The setting chosen with a model becomes part of `model.triage` or `model.extraction`.
- **A benchmark candidate** is written `<model>` or `<model>+reasoning=<off|low|medium|high>`. Reports and raw responses use the whole string; usage records keep the bare, pinned model ID (REQ-AGENT-014).
- **Price table `2026-11-11`** has the prices of the list read that day: `gpt-oss-120b` added, Gemma's cached-input price added, and the input prices of `glm-4.7-flash` and `bge-base-en-v1.5` as listed. The exchange rate stays at the ECB reference rate of 2026-11-09 (USD 1.1193 per EUR), because the ECB service could not be reached from the session that wrote the table. `model.price_table_version` and the benchmark command default to it; the tables of 2026-11-06 and 2026-11-10 stay as they are.

## Consequences

- Round two runs five candidates: about 91 × 3 × 3 triage calls and 39 × 3 × 2 extraction calls, plus retries. At round one's measured token counts and these prices it is expected to cost about EUR 1 to 2, within the budget of EUR 5.
- Gemma without thinking answers in seconds instead of up to a minute; if it qualifies, it is the cheapest and fastest triage option.
- A round resumes only with the price table it started with (ADR 0083), so a round started on the table of 2026-11-10 keeps it.
