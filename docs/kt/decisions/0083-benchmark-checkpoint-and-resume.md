---
title: "0083: The benchmark command checkpoints each run and can resume a round"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-NFR-005, REQ-NFR-011, REQ-TEST-006]
---

# 0083: The benchmark command checkpoints each run and can resume a round

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the output and the options of the benchmark command in [running a round](../test/model-benchmark-run.md). No requirement and no pipeline behavior changes.

## Context

Round one of the benchmark took about seven hours for its slowest pair of step and model ([ADR 0082](0082-benchmark-round-one-selects-no-model.md)). The command wrote its files only when a round ended. When the machine that ran it was replaced at 08:55 UTC on 10 November 2026, three of the four rounds were lost and had to start again; their 99 calls (USD 0.10) and about 35 minutes were wasted. Round two adds candidates and a reasoning variant, so its rounds are longer still. The owner chose checkpointing before round two.

## Options considered

1. **A checkpoint per run, and `--resume` with the stored plan.** Chosen by the owner.
2. **Shorter rounds, one run per command.** No code, but stability needs every run of an item in one round, so it would have to be computed by hand.
3. **A checkpoint per item.** Loses less work, but the eval scores a run as a whole, and a run of one model takes 10 to 90 minutes, which is little to repeat.

## Decision

- When a run of one step and model ends, the command appends one line to `<out>/<benchmark id>/checkpoint.jsonl`: the run's summary, pass or fail per golden-set item, the outcome of each item in `callModel`, its usage records, and its raw responses. When a round starts, it writes `run.json` with the plan, the item limit, and the price table version.
- `--resume <benchmark id>` continues that round with its stored plan. Finished runs make no calls; their records, raw responses, and cost count as before, so the budget (REQ-NFR-005), stability, and the report are those of an uninterrupted round, and record IDs and call numbers continue. A run that was cut off starts again from its first item.
- `--resume` takes no plan flags and refuses a price table other than the one the round started with, so the cost of one round is computed with one table (REQ-NFR-011).

## Consequences

- A replaced machine costs at most the run in progress. The checkpoint file grows with the raw responses, a few megabytes for a long extraction round, and stays in the local output directory with the other files (and is not committed).
- The round's directory is created only after the credentials are accepted, so a run that cannot start leaves nothing behind.
