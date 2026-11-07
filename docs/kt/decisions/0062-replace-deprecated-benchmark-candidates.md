---
title: "0062: Replace the benchmark candidates that Workers AI deprecates on 2026-11-20"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-AGENT-014, REQ-AGENT-012, REQ-TEST-006]
---

# 0062: Replace the benchmark candidates that Workers AI deprecates on 2026-11-20

- Decision status: Accepted
- Date: 2026-11-07
- Answers: none (OQ-036 stays open)
- Changes: the candidate tables of the [model benchmark plan](../test/model-benchmark-plan.md) and the OQ-005 row of [phase 2 dependencies](../phase-2/dependencies.md)

## Context

On 2026-11-05 Cloudflare announced that a set of Workers AI models stops answering on 2026-11-20. From that date, requests to them fail with HTTP 410 and error code 5028 ([changelog](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/)). No code calls a model yet, so nothing breaks at runtime. Several candidates of the model benchmark plan are on the list:

| Step | Deprecated candidate |
|---|---|
| Triage | `qwen3-30b-a3b-fp8` |
| Opportunity extraction, Research Analyst, Problem Discovery, Relevance | `glm-5.3-flash` |
| Market Analysis, Competition | `deepseek-v4-pro-0813`, `kimi-k2.6` |
| Startup Generator | `kimi-k2.6` |
| Also eligible | `nemotron-3-120b-a12b` |
| Embedding (ADR 0010) | `embeddinggemma-300m` |

A deprecated model cannot be chosen, because REQ-AGENT-014 pins an exact version that must keep working. Benchmarking one would spend budget on a result that cannot be used. Round one (triage and extraction, two candidates each) would have lost one candidate per step.

Cloudflare recommends `deepseek-v4.1-flash-1017` and `glm-5.3` for frontier needs, and `gemma-4-26b-a4b-it` and `qwen3.8-27b` for smaller needs.

## Options considered

1. **`gemma-4-26b-a4b-it` for the smaller steps.** It was already listed as eligible in the plan: 256k context, $0.10 / $0.30, function calling, reasoning, batch, zero data retention, and no paid-plan limit on its page. Chosen by the owner.
2. **`qwen3.8-27b` for the smaller steps.** Not yet read in the plan; price, licence, and limits unknown.
3. **Both, three candidates per step.** Raises the cost of round one by about half.

For Market Analysis, Competition, and Startup Generator, the owner chose `deepseek-v4.1-flash-1017` next to `glm-5.3`, over `gpt-oss-120b` or leaving the steps open until phase 3.

## Decision

- Triage: `glm-4.7-flash` and `gemma-4-26b-a4b-it`.
- Opportunity extraction: `deepseek-v4.1-flash-1017` and `gemma-4-26b-a4b-it`.
- Research Analyst: `gemma-4-26b-a4b-it`, `deepseek-v4.1-flash-1017`, and `clairic` (typed fields only).
- Problem Discovery and Relevance: `gemma-4-26b-a4b-it` and `deepseek-v4.1-flash-1017`.
- Market Analysis, Competition, and Startup Generator: `glm-5.3` and `deepseek-v4.1-flash-1017`.
- `nemotron-3-120b-a12b` leaves the list of eligible models; `qwen3.8-27b` joins it.
- The embedding benchmark of ADR 0010 drops `embeddinggemma-300m` and adds `embeddinggemma-2` once it is available. The reference `bge-base-en-v1.5` does not change.

## Consequences

- Round one keeps two live candidates per step. The thresholds, method, and decision rules of the plan do not change.
- `infrastructure/cloudflare/measure/cost-assumptions.json` does not change: it prices triage on `glm-4.7-flash` and extraction on `deepseek-v4.1-flash-1017`, which stay the dearer candidates of their steps.
- `gemma-4-26b-a4b-it` falls under the default limit of 300 requests per minute as far as its page shows. The rate-limit measurement of the plan confirms it.
- If `embeddinggemma-2` wins the embedding benchmark with other dimensions, the index is recreated as ADR 0027 and ADR 0056 describe.
- Until the nightly deprecation report of REQ-AGENT-014 exists, the benchmark checks the Workers AI changelog for planned deprecations before each run.
