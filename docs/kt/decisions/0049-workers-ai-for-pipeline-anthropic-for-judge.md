---
title: "0049: Workers AI for the pipeline steps, Anthropic for the eval judge"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-NFR-003, REQ-AGENT-010, REQ-AGENT-014, REQ-TEST-004, REQ-TEST-005]
---

# 0049: Workers AI for the pipeline steps, Anthropic for the eval judge

- Decision status: Accepted
- Date: 2026-11-06
- Answers: OQ-040
- Changes: the provider line of the [technology stack](../architecture/technology-stack.md), `README.md`, `AGENTS.md`, [agents](../agents/README.md), [privacy](../architecture/privacy.md), and the secrets of [operations](../operations.md)

## Context

The documents disagreed about which providers the pipeline may call. `README.md`, `AGENTS.md`, [agents](../agents/README.md), and the [technology stack](../architecture/technology-stack.md) named OpenAI or Anthropic through AI Gateway. The [model benchmark plan](../test/model-benchmark-plan.md) and OQ-036 benchmark only Cloudflare-hosted models (owner decision of 2026-11-01). OQ-020 needs a model judge that is a different model than the agent it grades.

The contracts in `packages/models` and the eval runner in `agents/extraction` take any `ModelFn`, so the answer changes configuration and documents, not code.

## Options considered

1. **Workers AI for every pipeline step, Anthropic for the eval judge only.** Chosen.
2. **Workers AI for the pipeline, OpenAI for the judge.** Equivalent, with a different judge provider.
3. **Workers AI first, OpenAI or Anthropic as a fallback** for a step where no Workers AI candidate qualifies. Keeps two more providers in scope and widens the benchmark.
4. **OpenAI or Anthropic for the pipeline**, as the stack documents said. Reverses the benchmark decision of 2026-11-01.

## Decision

- Every model-backed pipeline step (triage, opportunity extraction, and the six analysis agents) runs on a Workers AI model, called through AI Gateway (REQ-NFR-003) with an exact, pinned model version (REQ-AGENT-014). The model per step is chosen by the [model benchmark plan](../test/model-benchmark-plan.md) (OQ-036).
- Anthropic is called only by the live evals, as the model judge of OQ-020, through AI Gateway, with the key `EVAL_ANTHROPIC_API_KEY` in the GitHub environment `evals` (ADR 0006). The judge receives only golden-set items, which are public abstracts.
- OpenAI is not called by the pipeline or the evals. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `EVAL_OPENAI_API_KEY` are removed from the secret list of [operations](../operations.md).
- A step with no qualifying Workers AI candidate stays open under decision rule 5 of the benchmark plan. Adding an external provider for a pipeline step needs a new ADR.

## Consequences

- Publication text sent by the pipeline stays with Cloudflare, which is already a processor for all platform data ([privacy](../architecture/privacy.md)). Workers AI keeps no inputs or outputs of standard requests and does not train on them. Each open model's licence must allow commercial use (hard filter of the benchmark plan).
- Gate question 4 of the [legal review brief](../legal/review-brief.md) covers OpenAI and Anthropic. The Anthropic judge falls under it. Model processing by Workers AI falls under the Cloudflare data processing agreement of launch question 8, which still has to be confirmed before launch.
- The rate limits of Workers AI paid models (20 requests per minute per account and model) apply to the pipeline. The benchmark measures whether the retry on 429 is enough (REQ-AGENT-012).
- OQ-040 is answered and removed from [open questions](../open-questions.md).
