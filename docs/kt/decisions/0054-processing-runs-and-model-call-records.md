---
title: "0054: Processing runs and model-call records"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-NFR-008]
---

# 0054: Processing runs and model-call records

- Decision status: Proposed
- Date: 2026-11-06

## Context

REQ-NFR-011 requires a record for every model call, with the run ID, cost as `Money`, and the price-table version when the cost is estimated. In [schema migration 0001](../architecture/schema-migration-0001.md), `model_call` belongs to a `pipeline_run`, which belongs to a candidate. But embedding, triage, and extraction run before any candidate exists. REQ-NFR-003 AC2 requires the gateway to show tokens, cost, and latency per agent and per run. Nothing documents how a call is tagged so the gateway can show this.

## Options considered

1. **Leave `run_id` empty for pre-candidate calls.** Then cost per run (REQ-NFR-005 AC3) cannot be computed.
2. **A processing run per day per environment**, which owns the publication-level calls. Candidate calls keep their pipeline run.
3. **A run per publication.** It is precise, but makes thousands of rows a day for no report that needs them.

## Decision

Option 2.

- **`processing_run`:** one row per `kind` and day: `daily`, `backfill`, `retraction-check`, `slice`. Every publication-level message carries its run ID.
- **`model_call`:**
  - `run_kind` is `processing` or `pipeline`, and `run_id` points to the matching table.
  - Cost is stored as `cost_amount` and `cost_currency`, with `price_table_version` and `estimated`.
  - The outcome is `ok`, `invalid-output`, or `provider-error`.
  - `gateway_request_id` is stored when the gateway returns one.
- **Gateway metadata:** each call passes the run ID, step, and agent, so the gateway logs can be grouped the same way.
- **Cost source:** when the binding response carries the gateway cost, it is stored as is. Otherwise the cost comes from the versioned price table and the record is marked `estimated`. WP2 of the [build plan](../phase-2/build-plan.md) checks this on the first calls. A later job may correct estimated records from the gateway logs by request ID.

## Consequences

- Cost per publication and per opportunity can be reported per processing run (REQ-NFR-005 AC3).
- The planned `pipeline_run.cost_eur` becomes `cost_amount` and `cost_currency` in migration 0010, to match `Money`.
- Neither table holds prompt or publication text (REQ-NFR-011 AC3).
