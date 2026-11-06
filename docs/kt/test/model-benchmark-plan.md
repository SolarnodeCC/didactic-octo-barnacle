---
title: Model benchmark plan
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-AGENT-010, REQ-AGENT-012, REQ-AGENT-014, REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-TEST-004, REQ-TEST-005]
---

# Model benchmark plan

Plan for choosing the model of each model-backed step by measurement. It follows the pattern of [ADR 0010](../decisions/0010-embedding-model-benchmark.md): pick the cheapest and simplest candidate that meets the threshold. The result is recorded in an ADR that closes OQ-036. This document changes no behavior and adds no requirement.

## Decisions taken

The owner decided the following on 2026-11-01.

| Topic | Decision |
|---|---|
| Hosting | Cloudflare only. Every candidate is hosted on Workers AI. No third-party provider is benchmarked in this round. |
| Labels | The owner labels the golden sets, and an agent prepares the draft labels (see [Labeling](#labeling)). |
| Critic step | Out of scope. The pipeline stays as in [orchestration](../architecture/orchestration.md). A model judge for Startup Generator stays in the evals. |
| Pass rule | The eval thresholds of REQ-TEST-005, written before the first run (see [Thresholds](#thresholds)). |
| Benchmark budget | Model cost of at most 50 euro in total. |
| Account plan | The account has an active Workers Paid subscription, so no upgrade is needed (see [Account plan](#account-plan)). |

## Scope

The eight model-backed steps: triage, opportunity extraction, Research Analyst, Problem Discovery, Market Analysis, Competition, Relevance, and Startup Generator. Scoring is plain code. The embedding model stays with ADR 0010.

Effort goes where the score is decided. Market Analysis (Market Potential, 25 %), Competition (Competitive Gap, 20 %), and Research Analyst (Scientific Novelty) feed score categories. Startup Generator feeds none.

## Hard filters

A candidate is dropped before the quality test when any of these fails.

| Filter | Source |
|---|---|
| Reachable through AI Gateway | REQ-NFR-003 |
| An exact, pinned model version, not an alias | REQ-AGENT-014 |
| Structured output through the provider, or a documented fall back to prompt plus validation | REQ-AGENT-010 |
| Model licence allows commercial use | check per model |
| Fits the ceiling of 2 euro per complete opportunity | [defaults](../architecture/defaults.md), ADR 0023 |
| Rate limit holds at `model.semaphore_max` = 8 | REQ-AGENT-012 |

## Candidates

Cloudflare model pages as read on 2026-11-01. Prices are US dollars per million input and output tokens and change often; read them again on the day of the first run.

| Step | Candidates | Why |
|---|---|---|
| Triage | `glm-4.7-flash` ($0.06 / $0.40, 131k), `qwen3-30b-a3b-fp8` ($0.05 / $0.34, 32k) | Highest call volume, short input. Models that need no paid plan have a default limit of 300 requests per minute. |
| Opportunity extraction | `deepseek-v4.1-flash-1017` ($0.30 / $1.20), `glm-5.3-flash` ($0.15 / $0.50) | Verbatim evidence quotes from an abstract. |
| Research Analyst | `glm-5.3-flash`, `deepseek-v4.1-flash-1017`, `clairic` (typed fields only) | Feeds Scientific Novelty. Clairic returns typed values with confidence and spans, not free text. |
| Problem Discovery | `glm-5.3-flash`, `deepseek-v4.1-flash-1017` | Rubric-based judgment on short input. |
| Market Analysis | `glm-5.3` ($1.40 / $4.40), `deepseek-v4-pro-0813` ($1.32 / $3.96), `kimi-k2.6` ($0.95 / $4.00) | Search tool loop (REQ-AGENT-013) and calibrated ranges. |
| Competition | `glm-5.3`, `deepseek-v4-pro-0813`, `kimi-k2.6` | Search tool loop and verifiable competitors. |
| Relevance | `glm-5.3-flash`, `deepseek-v4.1-flash-1017` | No publication text, no search. |
| Startup Generator | `glm-5.3`, `kimi-k2.6` | Synthesis of three earlier outputs. |

Also eligible, read on 2026-11-01. None of their pages shows a paid-plan notice, so the default limit of 300 requests per minute should apply (confirm in the first run). Add one to a step only to replace a candidate above.

| Model | Context | Input / output | Notes |
|---|---|---|---|
| `gemma-4-26b-a4b-it` | 256k | $0.10 / $0.30 | Vision, reasoning, function calling, batch. Gemma licence. Also on the Workers Free plan. |
| `gpt-oss-20b` | 128k | $0.20 / $0.30 | Reasoning, function calling, batch. |
| `gpt-oss-120b` | 128k | $0.35 / $0.75 | Reasoning, function calling, batch. Possible for Market Analysis and Competition without the paid-model limit. |
| `nemotron-3-120b-a12b` | 256k on the model page, 32k in the launch post | $0.50 / $1.50 | Reasoning, function calling. NVIDIA open model licence. Check the context before use. |

Notes:

- Keep two or three candidates per step. Every extra model multiplies the cost of a run.
- Clairic is a preview. Its terms let Cloudflare stop it without compensation, so it is never the only model of a production step.
- The largest candidate of a step serves as the reference for that step. There is no third-party reference.
- These candidates require the Workers Paid plan or prepaid AI Gateway credit, and have a limit of 20 requests per minute per account and model (50 with prepaid credit): `glm-5.3`, `glm-5.3-flash`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `deepseek-v4.1-flash-1017`, and `kimi-k2.6`. The account has a Workers Paid subscription, so they are available (see [Account plan](#account-plan)); on Workers Free they would return a 403.
- `glm-4.7-flash` and `qwen3-30b-a3b-fp8` fall under the default limit of 300 requests per minute for text generation, as far as the pages show.

## Account plan

- The Cloudflare account has an active Workers Paid subscription (owner's screenshot of the billing page, 2026-11-01; renews on 2026-11-05, together with R2 Paid, Images Stream Basic, Teams Free Base, and Beta Analytics Engine API). An earlier statement that the account was on Workers Free was wrong, and the upgrade decision that followed from it is void.
- Workers Paid keeps the 10,000 free Workers AI neurons per day and bills further use at $0.011 per 1,000 neurons. The paid-model candidates are available, with the limit of 20 requests per minute per account and model.
- The owner confirmed that the subscriptions belong to the project's Cloudflare account. A 403 with internal error 5035 on the first call to a paid-model candidate would still mean the gateway or Worker runs under another account.
- R2 Paid is active on the same account. R2 is object storage, not a database (the databases are D1). The benchmark can keep the raw model responses of each run in R2, in a staging bucket under a benchmark prefix with no production data, so a run can be graded again without new model calls (see [Method](#method)).
- Production needs the paid plan. With the assumed 3k input and 1k output tokens per analysis agent, six agents for 300 candidates a day come to about 100,000 neurons per day on `gemma-4-26b-a4b-it` (about $1) and about 300,000 on `gpt-oss-120b` (about $3), against 10,000 free. Neuron prices come from the Workers AI pricing page. This is an assumption, not a measurement.

## Test data

- Reuse the golden sets of [AI evals](ai-evals.md) and [golden sets](golden-sets.md): at least 20 entries per step (REQ-TEST-005).
- Proposal: one shared set of about 50 publications from OpenAlex and arXiv, stratified by source, field, and abstract length, so one set feeds all steps. The number is a proposal; the minimum is 20.
- Include publications that must yield no opportunity (at least three), abstracts with injected instructions (REQ-NFR-006), and a few with licensed full text (`InputMode: full-text`).
- Search results for Market Analysis and Competition are recorded fixtures. The benchmark makes no live search calls (REQ-AGENT-013, REQ-TEST-003).
- Keep every benchmark item out of prompts and examples.

### Labeling

The owner labels the items. An agent prepares draft labels, and the owner reviews every label before it counts.

- The drafting agent must not be a candidate in the benchmark, so its bias does not favor a candidate.
- A draft label that the owner did not review is not used.
- Each entry names its reviewer (golden sets). These labels are provisional for this benchmark. They do not close OQ-015, which asks for named industry reviewers and two reviewers on a shared sample.
- Re-label a sample of at least 10 items a few days later, or have a second person do it, to estimate label noise.

## Method

For each pair of step and model:

1. Use the same prompt version, schema, and sampling settings. Do not tune a prompt per model in the first round.
2. Run every item three times (the stability check of [AI evals](ai-evals.md)).
3. Use the shared model-call helper through AI Gateway, so validation, repair, retry, and usage records are measured too (ADR 0003).
4. Record per call: exact model version, `OutputMode`, attempts, repairs, input and output tokens, latency, cost, and outcome (REQ-NFR-011).
5. Keep the default reasoning setting in round one. Test one alternative setting only for finalists in round two.
6. Grade free text with a model judge that is a different model than the candidate (OQ-020), checked against human labels as described in [AI evals](ai-evals.md).
7. Keep the raw response of every call in R2 under a benchmark prefix of a staging bucket, next to the usage record. Grading and metrics can then be recomputed without new model calls. The benchmark items are public abstracts (CC0), and the usage records hold no publication text (REQ-NFR-011).

### Eval runner

The deterministic checks already run without a model. `agents/extraction/src/eval.ts` loads the triage and extraction golden sets with their fixtures, and scores any `ModelFn` (publication in, raw output out) against them:

- **Triage:** the schema, agreement per signal, and the decision that `decideTriage` derives (REQ-PROC-008). It reports precision and recall of the accept decision.
- **Extraction:** the schema, verbatim quotes (REQ-AGENT-008), and the number of candidates (REQ-PROC-009).
- **Both:** the two repairs of REQ-AGENT-011, and the pass rate against the stored threshold.

The contracts it uses are in `packages/models` (`triage.ts`, `extraction.ts`, `agent-contract.ts`). Unit tests run it with stubs:

- A stub that answers with the labels passes every entry, which proves the golden sets fit the contracts.
- Stubs that answer wrongly fail.

Still to add for the benchmark:

- The model-call helper through AI Gateway (ADR 0003).
- The three-run stability check.
- The model judge for `Finding` and `Customer` (OQ-020).
- Usage records (REQ-NFR-011).

### Metrics

| Step | Main metrics |
|---|---|
| Triage | Agreement per signal with the labels (REQ-PROC-008), precision and recall of the accept decision that code derives from them, theory-only papers rejected |
| Extraction | Share of quotes found verbatim in the input, recall of expected findings, a named customer with a quote on every candidate (REQ-PROC-009), empty cases returned empty |
| Research Analyst | Industry and technology match, novelty against the labels, calibration of `Confidence` (capped at 0.7 for abstract-only) |
| Problem Discovery | Agreement with the `PainLevel` rubric, consistency of Problem and Customer |
| Market Analysis | Within one order of magnitude of the expected SAM and growth, correct `Basis`, share of cited sources that support the figure |
| Competition | Share of `Verified: true` competitors that a result supports, quality of `Gap` |
| Relevance | Distance to the labels for `IndustryFit`, `TechnicalFeasibility`, and `ImplementationEffort` |
| Startup Generator | Judge rubric plus a human sample, consistency with Problem Discovery and Competition |

For every step also report first-attempt schema validity, repair rate, share that fails after three attempts, p50 and p95 latency, and cost per call.

## Thresholds

[AI evals](ai-evals.md) requires a pass threshold per agent, written down and approved by a code owner before the first eval run, and taken from what the product needs, not from first results. The files and their values are in [golden sets](golden-sets.md#threshold-values): one file per step under `agents/<area>/evals/`, in three tiers (0.85, 0.75, and 0.7, with a tolerance of 0.05). The same threshold applies to every candidate of a step.

With 20 entries, one entry is five percentage points. Grow the set before tightening a threshold in smaller steps.

## Decision rules

Fixed before the first run.

1. A model qualifies only if it meets the threshold of the step.
2. Among qualifying models, choose the cheapest and simplest, unless a more expensive one is clearly better on the main metric of the step and the owner accepts the cost.
3. For Market Analysis, Competition, and Research Analyst, quality outweighs price.
4. A preview model is never the only model of a production step.
5. A step with no qualifying candidate stays open, and the candidate list or the prompt is reconsidered.

## Extra measurements

- **Rate limit:** measure requests per minute at 8 concurrent calls for each model that needs a paid plan. REQ-AGENT-012 limits concurrent calls per provider, while these models limit requests per minute per model. Check whether the retry on 429 with `Retry-After` is enough, or whether the model-call helper needs a per-model request rate. This plan changes no requirement; report the result in the ADR.
- **Cost:** fill `infrastructure/cloudflare/measure/cost-assumptions.json` with real prices and measured tokens, and compare with the ceiling of 2 euro per complete opportunity. Check whether AI Gateway returns cost for Workers AI models, or whether the price table of REQ-NFR-011 is needed.
- **Batch:** test the asynchronous batch API for triage and extraction, where real time is not needed.
- **Errors:** record 429 responses, timeouts, and `Retry-After` values.

Stop and ask the owner before the total model cost passes the budget of 50 euro. A rough estimate with the placeholder tokens of the cost file and an assumed 3k input and 1k output tokens per analysis agent is about $0.01 to $0.02 for a full chain per candidate on a flash model. This is an assumption, not a measurement.

## Risks

| Risk | Mitigation |
|---|---|
| A small set gives noise | Three repeats, report spread, treat close results as equal |
| A prompt suits one model | No per-model tuning in round one; a second round with the same budget per model |
| The model catalog changes during the test | Pin versions, note the date, check again before the ADR |
| Label errors | Re-label a sample, resolve disagreement before items enter the set |
| Draft labels from an agent bias the result | The drafting agent is no candidate; the owner reviews every label |
| The judge favors its own family | The judge is another model than the candidate; human sample |
| Candidates are not allowed to process the text | Workers AI keeps no inputs or outputs and does not train on them; check the licence of each open model |

## Steps

1. Approve the threshold files (done by merging the pull request that adds them).
2. Confirm the rate limits and the candidate list on the first calls (the account is on Workers Paid).
3. Prepare the golden sets: agent drafts, owner reviews, sample re-labeled.
4. Build the harness on the shared model-call helper and the eval runner, with cost recording.
5. Round one: all candidates, fixed prompt.
6. Round two: finalists, one reasoning variant, optional prompt tuning.
7. Write the ADR, update the model configuration, and close OQ-036.

ADR 0049 already updated the [technology stack](../architecture/technology-stack.md), [privacy](../architecture/privacy.md), [operations](../operations.md), `README.md`, and `AGENTS.md` for Cloudflare-hosted pipeline models. The benchmark ADR names the models and needs no further change to them unless it picks an external provider.

## Questions and answers

Status: **confirmed** (KT documents or Cloudflare documentation), **assumption** (inferred here), or **open**.

**Why does the project need a model provider?** The agents are plain TypeScript Workflow steps that each make one structured model call (ADR 0003). Confirmed.

**Is Anthropic required?** No. The documents name OpenAI or Anthropic, and `ANTHROPIC_API_KEY` is only needed when Anthropic is configured (operations). Confirmed.

**Can open models on Cloudflare be used?** Yes in principle: all calls go through AI Gateway and the model is configuration. The documents plan Workers AI only for embeddings, so text generation needs an ADR. Confirmed.

**Does a large context window matter?** Probably less than assumed. The standard input is a title and abstract (ADR 0014) plus earlier agent outputs. Assumption.

**Can Workers AI return structured JSON?** Yes, through JSON mode and JSON Schema. REQ-AGENT-010 still requires validation of every output. Confirmed. Test per model.

**What about privacy on Workers AI?** Cloudflare does not retain inputs or outputs of standard requests and does not train on them. AI Gateway logging or caching, and storage services, do keep content. Confirmed.

**Where does cost matter?** Little. The ceiling is 2 euro per complete opportunity and a chain on flash models is estimated far below it. Assumption.

**Why not follow a published ranking?** No source compares these models on these tasks, and the ranking that prompted this plan named a model that is not in the Cloudflare catalog. Confirmed.

**Why is a critic step out of scope?** The pipeline has no review step, and one more step needs an ADR, a new step name, and probably a migration (migration 0001 is frozen, ADR 0028). The owner chose not to pursue it now. Confirmed.

**Is Clairic a fit for extraction?** Not directly. It returns typed field values, while extraction returns a free sentence with a verbatim quote. Worth testing for Research Analyst fields. Assumption.

**What stays open?** The golden sets with their labels, the first calls that confirm the limits, and the ADR with the result. See OQ-036.
