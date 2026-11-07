---
title: Running a model benchmark round
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-AGENT-012, REQ-TEST-006]
---

# Running a model benchmark round

How to run a round of the [model benchmark plan](model-benchmark-plan.md) (OQ-036). The command is `roi-benchmark` in `agents/extraction/src/benchmark/`. It changes no behavior of the pipeline.

## What a round does

For each step and each candidate model, the command runs every golden-set item `--runs` times (three by default):

- It runs the prompt version of the step (`triage@1` or `extraction@1`) through `callModel`, with the same sampling settings for every model.
- It scores the accepted output with the eval runner and its thresholds.
- It records one usage record per attempt (REQ-NFR-011) and keeps every raw response and provider error.

Without `--models` it runs round one of [ADR 0062](../decisions/0062-replace-deprecated-benchmark-candidates.md):

| Step | Candidates |
|---|---|
| Triage | `@cf/zai-org/glm-4.7-flash`, `@cf/google/gemma-4-26b-a4b-it` |
| Opportunity extraction | `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, `@cf/google/gemma-4-26b-a4b-it` |

Calls go to the AI REST API on `api.cloudflare.com` with the header `cf-aig-gateway-id`, so every call passes through the named AI Gateway (REQ-NFR-003). The gateway is `roi-staging` unless `--gateway` names another.

- Each call carries the run, step, and agent as gateway metadata, and sets `cf-aig-skip-cache` so the three runs are independent samples.
- Calls are spaced at least 3 seconds apart (`--min-interval-ms`), which keeps a paid model under 20 requests per minute.
- A 429 is retried after its `Retry-After`. A 410, which a deprecated model returns, fails the step at once.

## Budget

The command counts the estimated cost of every attempt in euro from the price table (`infrastructure/cloudflare/prices/2026-11-06.json` unless `--prices` names another).

- Once the total reaches `--budget-eur` (50 by default, the budget of the plan), it starts no new step.
- A step that has started finishes its retries (REQ-NFR-005).
- The report then says the round is incomplete, and the command exits with status 1.

Start with `--limit 3 --runs 1` to see the real cost per call before a full round.

## Credentials

A live run reads two environment variables and never writes them anywhere:

| Variable | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The 32-character account ID of the project's Cloudflare account |
| `CLOUDFLARE_API_TOKEN` | A token with **Workers AI: Read** for that account, and **Workers R2 Storage: Edit** when `--r2-bucket` is used |

Keep the token in the GitHub environment `evals` or the Cursor environment secrets ([operations](../operations.md)), never in the repository. `--dry-run` answers every call with the golden-set labels and needs no credentials; use it to check the command and the report before spending.

## Commands

```bash
pnpm build
# Check the command and the report without credentials or cost.
pnpm --filter @roi/agent-extraction benchmark --dry-run --runs 1 --out "$PWD/benchmark-out"
# A small live sample: three items, one run, both steps.
pnpm --filter @roi/agent-extraction benchmark --limit 3 --runs 1 --out "$PWD/benchmark-out"
# Round one, three runs per item, raw responses also kept in R2.
pnpm --filter @roi/agent-extraction benchmark --r2-bucket roi-documents-staging --out "$PWD/benchmark-out"
# One step with other candidates.
pnpm --filter @roi/agent-extraction benchmark --step triage --models @cf/zai-org/glm-4.7-flash,@cf/qwen/qwen3.8-27b
```

`--out` is resolved from the package directory when it is relative, so pass an absolute path. `benchmark-out/` is ignored by git.

## Output

Each round writes a directory `<out>/<benchmark id>/` with these files:

| File | Content |
|---|---|
| `report.md` | The table per step and model, plus signal agreement, precision, and recall for triage. The table columns are mean and minimum pass rate, whether the threshold was met in every run, stability, first-attempt validity, repair rate, share failed after the last attempt, provider errors, p50 and p95 latency, and cost per step |
| `summary.json` | The same figures, with the plan, the price table version, and the total cost |
| `model-calls.jsonl` | One usage record per attempt, with no prompt or publication text |
| `raw-responses.jsonl` | Every provider response or error, with its step, model, run, and publication, so a round can be graded again without new calls |

With `--r2-bucket`, `raw-responses.jsonl` and `model-calls.jsonl` are also stored under `benchmark/<benchmark id>/` in that bucket. Use a staging bucket: the items are public abstracts (CC0), and nothing from production is involved.

Stability is the share of items whose pass or fail is the same in all runs. Extraction is scored on the deterministic checks only: schema, verbatim quotes, and candidate count. The model judge for `Finding` and `Customer` (OQ-020) is not part of a round yet.

## After a round

1. Read `report.md` against the [decision rules](model-benchmark-plan.md#decision-rules) and the thresholds.
2. Record the result, the benchmark ID, the price table version, and the cost in the ADR that closes OQ-036.
3. Compare the gateway's logged cost with the estimated cost of the records. If the gateway returns cost for Workers AI, note it in that ADR (ADR 0054).
