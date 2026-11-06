---
title: Phase 2 approach
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-TEST-001, REQ-TEST-002, REQ-TEST-003, REQ-NFR-020]
---

# Phase 2 approach

## Gate first

Phase 2 starts when its [Definition of Ready](../roadmap.md#definition-of-ready-for-a-phase) holds. The gates, their owners, and the evidence for each are in [dependencies](dependencies.md#gates). Until then only the gate-enabling work packages run:

- **WP0** closes the documentation gates (requirement and agent documents approved).
- **WP1 to WP3** build the shared model-call helper, the usage record, and the prompts. The [model benchmark plan](../test/model-benchmark-plan.md) (step 4) runs on that helper, and the benchmark closes OQ-036, so this work comes before the gate and not after it. It ships with stubbed models only and makes no live calls outside the `evals` environment (ADR 0006).

Every other work package waits until the gates are closed. No phase 2 code makes model calls in staging or production before then.

## Model-free build

- Every model call goes through the `callModel` helper (ADR 0003). Tests replace the Workers AI binding with a stub that returns recorded or hand-written responses, so unit, contract, and integration tests never call a live model (REQ-TEST-002 AC2).
- Integration tests run in Node with in-memory stand-ins, as in phase 1 (ADR 0043): the SQLite stand-in for D1 with the real migrations, the fake queue and bucket, and new fakes for Vectorize and Workers AI. A fake Vectorize ranks by exact cosine similarity over stored vectors, so search tests have known answers. `@cloudflare/vitest-plugin` comes in only if a binding behaves in a way the fakes cannot show.
- The network guard (`test-support/no-network.ts`) stays on for every project.
- Live model calls happen in three places only: the benchmark in the `evals` environment, the staging measurement of WP11, and production after the phase 2 release.

## One work package per pull request

- Each pull request carries one work package of the [build plan](build-plan.md), or one part of it, names the REQ-IDs it implements, and names the REQ-ID in every new test (`check:traceability`).
- A requirement moves `planned` → `in-progress` in the first pull request that implements it, and → `done` in the pull request that brings its last acceptance criterion and its test.
- Schema changes are new numbered, expand-only migrations (ADR 0028); the previous Worker version keeps working against the new schema (REQ-NFR-020).
- A new queue, Vectorize metadata index, or binding is added to the bootstrap resource list first. The automated staging pipeline (ADR 0046) stops before the deploy until bootstrap has applied it.
- Each pull request that changes behavior updates the KT documents it affects, as usual.

## Stubs and the thin slice

- The thin slice (REQ-PROC-007) uses the example outputs in [examples](../examples/README.md) as stub agent outputs. Before WP10 the examples gain the `Customer` and `CustomerQuote` fields that REQ-PROC-009 requires, and they are validated against the `packages/models` schemas in a test.
- A stub step has the same input, output, and step name as the phase 3 agent it stands for. Phase 3 replaces stubs one by one without changing the pipeline (REQ-PROC-007 AC4).

## Rollout

1. Merge to `main` and deploy to staging through the automated staging pipeline (ADR 0046), with the new queues and bindings in bootstrap.
2. The phase 2 consumers start behind the `processing.enabled` switch, off by default. Staging turns it on first, with the budget configured.
3. Staging runs for at least seven days. The run reports show triage, extraction, embedding, and cost counts.
4. Production follows the weekly release (ADR 0044) once the staging measurement has replaced the cost estimate (REQ-NFR-005 AC1).

## Exit evidence

| Exit criterion | Evidence |
|---|---|
| Recall at 10 of at least 0.8 on the fixture corpus | The recall report of the corpus (ADR 0057) on the chosen embedding model, attached to the closing pull request |
| Triage and extraction meet their golden-set thresholds | Eval reports from the benchmark ADR that closes OQ-036 and a rerun on the configured models and prompts |
| Candidates within the daily budget | Seven staging days with no budget stop, or a stop that worked as REQ-NFR-005 AC2 says; cost per publication and per opportunity in each run report |
| Thin slice end to end | The slice integration test in CI and one run of the slice command in the development environment, with its run report |
