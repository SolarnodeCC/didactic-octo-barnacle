---
title: Test levels
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-002, REQ-API-003, REQ-AGENT-009]
---

# Test levels

| Level | What it covers | Proposed tool | Runs |
|---|---|---|---|
| Unit | Pure functions: scoring, parsing, metadata extraction, deduplication, triage rules, mapping | Vitest | every pull request |
| Integration | Workers with their bindings: D1, R2, Queues, Vectorize, Workflows | Vitest with `@cloudflare/vitest-plugin` (local runtime) | every pull request |
| Contract | Agent output against its output contract; API request and response shapes (REQ-API-003) | Schema validation (for example Zod or JSON Schema) in Vitest | every pull request |
| End-to-end | Dashboard user flows against a local API with seeded data | Playwright | every pull request from phase 4 |
| Eval | Quality of agent output against golden sets | Eval runner (see [AI evals](ai-evals.md)) | on prompt or model changes, and nightly |
| Load | Throughput of ingestion and the pipeline (REQ-NFR-010) | Recorded fixtures with stubbed models | on demand and before each phase exit |

Pin the versions of the test tools. The Workers test plugin must match the Wrangler version in use (ADR 0008).

## Unit

Cover every branch of deterministic logic. Scoring (REQ-SCORE-001, REQ-SCORE-002, REQ-SCORE-003) is tested on fixed inputs and boundary values, including a weighted sum of exactly 69.5. Deduplication (REQ-DATA-007) is tested on pairs that must and must not match.

## Integration

Run Workers in the local runtime with real local bindings, not hand-written mocks of D1 or R2. External HTTP calls are served from fixtures (see [test data](test-data.md)). Check idempotency: running an ingestion twice gives the same state. Check resumption: a pipeline stopped after a step resumes without repeating it (REQ-AGENT-007).

## Contract

Each agent's output contract is defined once as a schema in `packages/models` and used by both the agent and its tests (see [contract conventions](../agents/contract-conventions.md)). A contract test feeds the agent stubbed model responses and asserts that:

- valid output passes;
- missing fields, wrong types, and values out of range are rejected and retried, up to the attempt limit, and then fail the step (REQ-AGENT-009);
- an evidence quote that does not occur in the input is rejected (REQ-AGENT-008);
- an injection fixture does not change the output beyond the contract (REQ-NFR-006).

## End-to-end

Keep end-to-end tests few and focused on the flows named in the dashboard requirements (REQ-DASH-001, REQ-DASH-002, REQ-DASH-003). Use seeded data, never live agents. Run an automated accessibility check on each flow (REQ-DASH-006) and test that unauthenticated requests are refused (REQ-NFR-007).

## Coverage

Coverage is reported, not gated. The gate is traceability: every requirement with status `done` must have a verifying test or named review (REQ-TEST-001).
