---
title: Test requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Test requirements

These requirements make the [test strategy](../test/README.md) checkable.

### REQ-TEST-001: Traceability to requirements

Every test names the requirement it verifies.

- Phase: 1
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. Each test name or description contains a REQ-ID.
  2. A requirement with status done has at least one test or a named review as verification.
- Verification: traceability check in CI, added with the first test suite

### REQ-TEST-002: Agent contract tests

Every agent has a contract test for its output contract.

- Phase: 2
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. The test fails when a field is missing or has the wrong type.
  2. The test runs without calling a live model.
- Verification: contract test suite in CI

### REQ-TEST-003: No live external calls in CI

Pull request CI does not call academic APIs or model providers.

- Phase: 1
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. Academic API tests use recorded fixtures.
  2. Model calls in pull request CI are stubbed; live evals run only on the nightly schedule.
- Verification: code review of the test setup

### REQ-TEST-004: Evals on prompt and model changes

A change to prompts or to the model configuration runs the evals.

- Phase: 3
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. A pull request that changes prompts or model configuration runs the evals for the affected agents.
  2. The pull request cannot merge when an agent falls below its eval threshold.
- Verification: CI job

### REQ-TEST-005: Golden set per agent

Each agent has a reviewed golden set.

- Phase: 3
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. The golden set holds at least 20 papers per agent with reviewed expected outcomes.
  2. Changes to the golden set go through a pull request with a named reviewer.
- Verification: code review
