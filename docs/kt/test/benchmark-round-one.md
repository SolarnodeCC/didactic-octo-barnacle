---
title: Benchmark round one run plan
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-AGENT-014, REQ-NFR-005, REQ-PROC-008, REQ-PROC-009, REQ-TEST-006]
---

# Benchmark round one: run plan

How round one of the [model benchmark plan](model-benchmark-plan.md) is run for triage and opportunity extraction (OQ-036). It adds no requirement. The owner approves this plan before the first live call, because the run spends model budget.

## What is run

| Step | Candidates (ADR 0062) | Golden-set entries | Runs | Calls |
|---|---|---|---|---|
| Triage | `glm-4.7-flash`, `gemma-4-26b-a4b-it` | 91 | 3 | 546 |
| Opportunity extraction | `deepseek-v4.1-flash-1017`, `gemma-4-26b-a4b-it` | 38 | 3 | 228 |
| **Total** | | | | **774** |

- The command is `agents/extraction/src/benchmark/cli.ts` (`pnpm --filter @roi/extraction benchmark`). It uses the shared `callModel` helper, the versioned prompts of `packages/prompts`, and the price table `infrastructure/cloudflare/prices/2026-11-10.json`, which prices cached input tokens (ADR 0078).
- It scores the deterministic checks only: schema, verbatim quotes, candidate count, agreement per signal, and the accept decision derived by code. The Anthropic judge for `Finding` and `Customer` (OQ-020) is not part of this round, so no judge key is needed.
- The pass rule is the threshold file of each step: an entry pass rate of 0.85 with a tolerance of 0.05 ([golden sets](golden-sets.md#threshold-values)). Every candidate of a step gets the same prompt and settings.

## Cost

With the placeholder token counts of `cost-assumptions.json` (triage 500 in and 100 out, extraction 1,500 in and 800 out) and the dearer candidate's price for every call, the run costs at most about EUR 0.32: about EUR 0.03 for triage and EUR 0.29 for extraction. That is under 1 % of the benchmark budget of EUR 50. The command stops at `--budget-eur`; the plan sets it to EUR 5, so a wrong token estimate cannot pass 10 times the figure above. The measured tokens and cost replace the estimate in the report.

## Steps

1. **Before any call.** Read the Workers AI changelog for planned deprecations (ADR 0062) and the price list of the day. Change the candidate list or the price file in a reviewed pull request if either moved.
2. **Dry run.** `--dry-run` answers with the golden-set labels and needs no credentials. Every entry must pass.
3. **Smoke run.** One live run of five entries per step (`--limit 5 --runs 1`). Check the first-attempt schema validity, the cost per call, and the requests per minute of each model, and set `--min-interval-ms` from them.
4. **Full run.** Both steps, three runs, `--budget-eur 5`. The report goes to `benchmark-out/` and lists, per candidate: pass rate per run, stability, first-attempt validity, repairs, failures after three attempts, p50 and p95 latency, tokens, and cost.
5. **Raw responses (optional).** `--r2-bucket` keeps every raw response in the staging bucket under a benchmark prefix, so the grading can be repeated without new calls. It needs an API token that may write to that bucket.
6. **Decision.** Apply the decision rules of the benchmark plan: a candidate qualifies at the threshold, then the cheapest and simplest qualifying candidate wins. Record the result in an ADR that closes OQ-036 for triage and extraction, set `model.triage` and `model.extraction`, and replace the prices of `cost-assumptions.json` with measured ones (REQ-NFR-005).

## What the run needs

- The owner's go-ahead for the plan above.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment that runs the command, as secrets and never in the repository. The token needs Workers AI read access, and for step 5 also write access to the staging bucket.
- No Anthropic key, and no search provider.
