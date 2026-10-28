---
title: Test levels
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-002]
---

# Test levels

| Level | What it covers | Proposed tool | Runs |
|---|---|---|---|
| Unit | Pure functions: scoring, parsing, metadata extraction, mapping | Vitest | every pull request |
| Integration | Workers with their bindings: D1, R2, Queues, Vectorize, Workflows | Vitest with the Cloudflare Workers pool (local Miniflare runtime) | every pull request |
| Contract | Agent output against its output contract; API request and response shapes | Schema validation (for example Zod or JSON Schema) in Vitest | every pull request |
| End-to-end | Dashboard user flows against a local API with seeded data | Playwright | every pull request from phase 4 |
| Eval | Quality of agent output against golden sets | Eval runner (see [AI evals](ai-evals.md)) | on prompt or model changes, and nightly |

## Unit

Cover every branch of deterministic logic. Scoring (REQ-SCORE-001, REQ-SCORE-002) is tested on fixed inputs and boundary values.

## Integration

Run Workers in the local runtime with real local bindings, not hand-written mocks of D1 or R2. External HTTP calls are served from fixtures (see [test data](test-data.md)). Check idempotency: running an ingestion twice gives the same state.

## Contract

Each agent's output contract is defined once as a schema in `packages/models` and used by both the agent and its tests. A contract test feeds the agent stubbed model responses, including malformed ones, and asserts that invalid output is rejected and retried, never passed on.

## End-to-end

Keep end-to-end tests few and focused on the flows named in the dashboard requirements (REQ-DASH-001, REQ-DASH-002, REQ-DASH-003). Use seeded data, never live agents.

## Coverage

Coverage is reported, not gated. The gate is traceability: every requirement with status `done` must have a verifying test or named review (REQ-TEST-001).
