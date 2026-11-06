---
title: "0049: Workers AI for pipeline steps, one external provider for the eval judge"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-TEST-004]
---

# 0049: Workers AI for pipeline steps, one external provider for the eval judge

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-040

## Context

The documents disagreed about which model providers the pipeline may call. `README.md`, `AGENTS.md`, the [agents](../agents/README.md) overview, and the [technology stack](../architecture/technology-stack.md) named OpenAI or Anthropic through AI Gateway. OQ-036 and the [model benchmark plan](../test/model-benchmark-plan.md) benchmark Cloudflare-hosted models only, and the phase 1 cost estimate (ADR 0032) is priced on two Workers AI models. OQ-020 needs an eval judge from a different provider than the agent it grades. Phase 2 cannot design the model-call helper, the price table, or the legal question for model providers until this is settled.

## Options considered

1. **Workers AI only, for every model call.** One provider, no external keys, one DPA. But the eval judge would come from the same provider as the agents it grades, which OQ-020 rules out.
2. **Workers AI for pipeline steps; one external provider through AI Gateway for the eval judge only.** Publication text reaches the external provider only from the `evals` environment, on golden-set fixtures.
3. **OpenAI or Anthropic for pipeline steps, as the stack documents said.** Stronger models, but the benchmark plan, cost estimate, and budget would have to be redone, and every pipeline call would need an external DPA and keys in every environment.

## Decision

Option 2.

- Triage, extraction, embeddings, and, unless a later ADR says otherwise, the six analysis agents run on Cloudflare-hosted models through the Workers AI binding, routed through the environment's AI Gateway (REQ-NFR-003).
- The eval judge (OQ-020) uses one external provider, OpenAI or Anthropic, through AI Gateway, only in the `evals` environment with its secrets (ADR 0006). The provider is named with the judge in phase 3.
- The model per step stays configuration. OQ-036 picks it by benchmark.

## Consequences

- No model-provider keys are needed in preview, staging, or production. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are not configured there; the eval keys stay in the `evals` environment ([operations](../operations.md)).
- The technology stack, agents overview, privacy processors, operations secrets, legal review brief (question 4 and 8), `README.md`, and `AGENTS.md` are updated in the same pull request.
- Model-provider data processing in the pipeline is covered by Cloudflare as processor. The external judge provider still needs its DPA before live evals run on non-public text.
- Changing a pipeline step to an external provider needs a new ADR, a legal answer, and a new cost estimate.
