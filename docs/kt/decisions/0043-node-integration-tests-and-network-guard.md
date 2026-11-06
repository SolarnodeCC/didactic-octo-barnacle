---
title: "0043: Node integration tests with a network guard"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-TEST-001, REQ-TEST-003, REQ-NFR-020]
---

# 0043: Node integration tests with a network guard

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the integration test tool of [0008](0008-toolchain.md) for phase 1 and phase 2; 0008 stays the target once a Worker needs a binding that has no Node stand-in

## Context

A testing audit of 6 November 2026 compared [test levels](../test/levels.md) and [test data](../test/test-data.md) with the code:

- The integration tests of `apps/pipeline` and `infrastructure/cloudflare` run in Node. They do not use `@cloudflare/vitest-plugin`. They apply the real migrations to in-memory SQLite (`apps/pipeline/src/test/sqlite-d1.ts`) and use in-memory fakes for Queues, R2, and the alert channels.
- The documents said that "a test that tries to reach the network fails". No setup file enforced that. `no-network.test.ts` stubbed `fetch` itself and then asserted its own stub.
- Unit and integration tests ran together in `pnpm test:unit`, although [CI gates](../test/ci-gates.md) lists integration tests as their own phase 1 gate.
- No coverage was reported, although [test levels](../test/levels.md) says coverage is reported.

## Options considered

1. **Move the integration tests to `@cloudflare/vitest-plugin` now.** Runs in workerd with real local bindings. But it adds Wrangler-pinned tooling for bindings that the Node stand-ins already cover, and it slows every pull request.
2. **Keep the Node stand-ins, enforce the network rule, and separate the levels.** Fast and deterministic. A difference between D1 and SQLite would only show in staging.

## Decision

Option 2:

- `test-support/no-network.ts` is a Vitest setup file in every project. It replaces the global `fetch` and refuses outbound TCP connections, with the message `REQ-TEST-003: network access is blocked in tests`. Tests that need `fetch` inject a stub. `vi.unstubAllGlobals` restores the guard, not the real `fetch`.
- Integration tests are named `*.int.test.ts` and run in the `integration` Vitest project (`pnpm test:integration`). Unit tests are the other `*.test.ts` files (`pnpm test:unit`).
- `pnpm test:coverage` reports V8 coverage in CI. Coverage is not a gate.
- `scripts/check-traceability.py` also fails on a REQ-ID that no requirement defines and warns about uncovered `in-progress` requirements. Its own tests live in `scripts/tests/` (`pnpm check:scripts`).

## Consequences

- A forgotten stub fails the test instead of calling OpenAlex, arXiv, or a model provider.
- A difference between D1 and SQLite is not caught before staging. The migration and schema checks of REQ-NFR-020 run against the real D1 at bootstrap.
- Move to `@cloudflare/vitest-plugin` when a Worker first needs Vectorize, Workflows, or Durable Objects (phase 2 or 3), and record it in a new ADR.
