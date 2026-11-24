---
title: "0116: The thin slice runs in-process with stub steps and a placeholder score model"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-PROC-007, REQ-DATA-008, REQ-AGENT-007, REQ-SCORE-001]
---

# 0116: The thin slice runs in-process with stub steps and a placeholder score model

- Decision status: Accepted
- Date: 2026-11-23
- Changes: how the thin slice of the [phase 2 design](../phase-2/design.md#thin-slice) runs, what its placeholder score model computes, and which tables migration 0014 adds beyond [schema migration 0001](../architecture/schema-migration-0001.md)

## Context

The phase 2 design starts the slice with `wrangler dev` and a local `slice` cron, and has the extraction consumer queue `candidate.run`. In `wrangler dev` the Workers AI binding always calls Cloudflare, so the slice would need a Cloudflare login, and the Worker would need a mode that answers triage and extraction from recorded responses. The extraction message carries no processing-run ID, so the extraction consumer cannot tell a slice publication from a daily one. The design names a placeholder score model, `placeholder-0` with equal weights, but not how it gets its categories.

## Options considered

1. **`wrangler dev` with a local cron and a recorded-response mode in the Worker.** This is closest to production, but it needs a login and is slow in CI, and the fixture mode ships in the Worker.
2. **Run the same code in Node, in one process, with a local SQLite database, recorded responses, and an inline Workflow runner.** Chosen by the owner on 2026-11-23.

## Decision

- **Command.** `pnpm --filter @roi/pipeline slice` runs the slice in Node:
  - a SQLite database built from the migrations;
  - a recorded fixture page and recorded model responses for triage and extraction;
  - the real consumers, with the queues drained inline;
  - one `candidate.run`, with the Workflow steps run inline;
  - the read route answered by the `apps/api` handler.

  The same function runs as an integration test in CI. There is no `slice` cron.
- **Workflow.** `CandidateWorkflow` (a `WorkflowEntrypoint`) runs `runCandidatePipeline` with its durable `step`. In phase 2 it is bound as `CANDIDATE_WORKFLOW` in local and preview only.
  - The pipeline takes any runner with `do(name, callback)`, so the slice and the tests run the steps inline.
  - Each step also writes `pipeline_step`, so a completed step is never repeated (REQ-AGENT-007 AC2).
- **`candidate.run`.** It is sent for the slice's candidates by the slice command, not by the extraction consumer, so daily runs queue none.
  - Its consumer writes `pipeline_run` (`pr_<candidateId>`, one per candidate in phase 2) and the `opportunity` (`incomplete`).
  - It then starts the instance.
  - A hidden candidate, or one of a retracted publication, is not run, and a scored one is not run again.
- **Stub steps.** Each agent step returns its section of the [example](../examples/context-switching-opportunity.yaml), with its evidence, inside a valid envelope (model `stub`, prompt version `example`). A publication quote names the run's publication.
  - The steps are a registry keyed by step name, so phase 3 replaces one entry (REQ-PROC-007 AC4).
  - Every output is checked against its contract before it is stored.
- **Placeholder score model.** `placeholder-0` (seeded by migration 0014, not active) derives the five categories with the rules of [ADR 0005](0005-derive-category-scores.md) and weights them equally.
  - The weighted sum is computed in basis points and rounded half up.
  - The example scores 71, High, with the label `estimate-based`.
  - A category that cannot be derived gives no score, and the opportunity stays incomplete. Phase 4 adds score model version 1 with the weights of [scoring](../scoring.md).
- **Tables beyond schema migration 0001.** Migration 0014 also adds:
  - `pipeline_run.processing_run_id`;
  - `evidence.publication_id` and `evidence.note`, which the evidence contract needs;
  - `opportunity.created_at` and `updated_at`;
  - `score.weighted_sum`.
- **Retractions.** The daily sweep hides the opportunities of a flagged publication with `pipeline_status = hidden` and `hidden_reason = retracted` (REQ-DATA-008 AC2).

## Consequences

- The slice needs no Cloudflare account and runs in CI. The real Workflow binding is exercised in preview, not by the slice.
- Wrangler warns that the top-level `workflows` table is not inherited by staging and production. That is intended until phase 3.
- The slice's model calls belong to the daily processing run of that day, because triage and extraction messages carry no run ID; the `slice` run report counts the slice's own steps.
