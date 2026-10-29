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
  1. Each test name or description contains a REQ-ID; tests of shared helpers that implement no requirement are allowed and reported as untraced.
  2. A requirement with status done has at least one test or a named review as verification.
- Verification: traceability check in CI, added with the first test suite

### REQ-TEST-002: Agent contract tests

Every model-backed step that exists in the current phase has a contract test for its output contract. In phase 2 that is opportunity extraction (REQ-PROC-004); the six analysis agents are added in phase 3.

- Phase: 2
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. The test fails when a field is missing, has the wrong type, or is outside its range.
  2. The test runs without calling a live model.
  3. By the end of phase 2, opportunity extraction has a contract test. By the end of phase 3, every analysis agent does too.
- Verification: contract test suite in CI

### REQ-TEST-003: No live external calls in unit, integration, and contract tests

Unit, integration, and contract tests do not call academic APIs or model providers.

- Phase: 1
- Priority: must
- Status: planned
- Source: test strategy and ADR 0006
- Acceptance criteria:
  1. Academic API tests use recorded fixtures, and a test that tries to reach the network fails.
  2. Model calls in these tests are stubbed. Live model calls run only in the eval job of REQ-TEST-004 and in the nightly eval run.
  3. The jobs for these tests need no secrets.
- Verification: code review of the test setup

### REQ-TEST-004: Evals on prompt and model changes

A change to prompts or to the model configuration runs the evals.

- Phase: 3
- Priority: must
- Status: planned
- Source: test strategy and ADR 0006
- Acceptance criteria:
  1. A pull request from a branch in this repository that changes prompts, model configuration, or an agent runs the evals for the affected agents.
  2. The pull request cannot merge when an agent falls below its eval threshold.
  3. A pull request from a fork does not run live evals; a maintainer runs them from a branch in this repository before merging.
- Verification: CI job

### REQ-TEST-005: Golden set per agent

Each agent and model-backed step has a reviewed golden set.

- Phase: 3
- Priority: must
- Status: planned
- Source: test strategy
- Acceptance criteria:
  1. The golden set holds at least 20 entries per agent, covers all four target industries, and holds at least three entries that should yield no opportunity.
  2. Each entry names its reviewer; entries for an industry are reviewed by someone with knowledge of that industry.
  3. Changes to the golden set go through a pull request with a named reviewer.
- Verification: code review
