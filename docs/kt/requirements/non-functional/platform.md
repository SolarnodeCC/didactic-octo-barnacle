---
title: Platform and cost requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
---

# Platform and cost requirements

The Cloudflare platform, model calls through AI Gateway, the cost budget, and usage records.

### REQ-NFR-002: Cloudflare platform

The platform runs on the Cloudflare services listed in the [technology stack](../../architecture/technology-stack.md).

- Phase: 1
- Priority: must
- Status: done
- Source: README Technology Stack
- Acceptance criteria:
  1. Every runtime component is deployed as a Cloudflare Worker, Workflow, or Durable Object. The dashboard part of this criterion moved to REQ-NFR-022 (ADR 0052).
  2. A service outside the listed stack is only added with an ADR.
- Verification: code review and the collector Worker entry tests

### REQ-NFR-022: Dashboard on Workers

The dashboard is deployed on Cloudflare Workers through the OpenNext adapter (ADR 0012). Split from REQ-NFR-002 AC1 (ADR 0052).

- Phase: 4
- Priority: must
- Status: planned
- Source: REQ-NFR-002, ADR 0012, ADR 0052
- Depends on: REQ-NFR-002
- Acceptance criteria:
  1. The dashboard is built with the OpenNext adapter and deployed as a Cloudflare Worker per environment.
  2. It is deployed through the same reviewed workflows as the other Workers, with no other hosting service.
- Verification: code review and a deploy check of the dashboard Worker

### REQ-NFR-003: Model calls through AI Gateway

All calls to model providers, including embedding calls, go through Cloudflare AI Gateway.

- Phase: 2
- Priority: must
- Status: in-progress
- Source: README Technology Stack
- Acceptance criteria:
  1. No component calls OpenAI, Anthropic, or another model provider directly.
  2. Tokens, cost, and latency per agent and per pipeline run can be read from the gateway.
  3. Every environment's gateway has Authenticated Gateway on. Bootstrap creates it that way, and the drift check fails `Staging deploy` and `Staging scheduled checks` when a gateway of the environment reports it off or does not report it (ADR 0117).
- Verification: code review, integration test, and the bootstrap drift check

### REQ-NFR-005: Cost budget

Model spending stays within a configured budget.

- Phase: 2
- Priority: must
- Status: in-progress
- Source: KT review of cost and volume, ADR 0059, ADR 0113
- Depends on: REQ-NFR-003
- Acceptance criteria:
  1. A daily budget for model calls is configured per environment. Before calibration it is the sum of the expected daily triage calls times the triage cost, the daily extraction limit times the extraction cost, and the expected daily embeddings times the embedding cost, times 1.5, with the size of the full-text input priced in (ADR 0059). At the start of phase 2 the cost per item is the benchmark cost of the configured models (ADR 0113, replacing the phase 1 estimate of ADR 0032); the measured cost from phase 2 model calls replaces it once enough items are recorded. Phase 2 does not start without the estimate.
  2. When the budget is reached, no new pipeline runs start that day; running steps finish.
  3. Cost per publication and per opportunity is reported for each run.
- Verification: integration test with a stubbed gateway and a low budget

### REQ-NFR-011: Usage recorded per model call

Every model call is recorded in the platform's own database with its usage and cost.

- Phase: 2
- Priority: must
- Status: in-progress
- Source: KT review of a comparable internal governance platform (token use and cost transparency) and REQ-NFR-005
- Depends on: REQ-NFR-003
- Acceptance criteria:
  1. Every model call, including embedding calls and retries, creates a model call record with the run ID, pipeline step, agent (when one applies), model, prompt version (when one applies), attempt number, input and output tokens, latency, cost as `Money`, and outcome (`ok`, `invalid-output`, or `provider-error`).
  2. The cost comes from AI Gateway. When the gateway returns none, the cost is computed from a configured price table, the table version is stored, and the record is marked as estimated.
  3. A record holds no publication text and no prompt text.
  4. Totals per agent, per step, and per day can be computed from the records alone, and agree with the AI Gateway totals within the tolerance stated in the test.
- Verification: integration test with a stubbed gateway
