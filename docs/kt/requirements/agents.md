---
title: Agent requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Agent requirements

Each agent is described in [agents](../agents/README.md). Every agent returns all fields of its output contract; a response that does not match the contract is rejected and retried, never passed on.

### REQ-AGENT-001: Research Analyst Agent

Analyzes a paper for novelty, industry, technology, and confidence.

- Phase: later
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Acceptance criteria:
  1. The output contains Novelty, Industry, Technology, and Confidence.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-002: Problem Discovery Agent

Identifies the problem, customer, and pain level behind a research finding.

- Phase: later
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Acceptance criteria:
  1. The output contains Problem, Customer, and PainLevel.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-003: Market Analysis Agent

Estimates market size and growth for an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework and roadmap phase 3 (Market Analyzer)
- Acceptance criteria:
  1. The output contains TAM, SAM, and GrowthRate.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-004: Competition Agent

Finds competitors and the gap and differentiation of an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework and roadmap phase 3 (Competitor Scanner)
- Acceptance criteria:
  1. The output contains Competitors, Gap, and Differentiation.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-005: Startup Generator Agent

Generates a startup concept for an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework and roadmap phase 3 (Startup Generator)
- Acceptance criteria:
  1. The output contains StartupName, BusinessModel, Pricing, and USP.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-006: Relevance Agent

Scores strategic relevance for the target industries and the implementation effort.

- Phase: later
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Acceptance criteria:
  1. The output contains StrategicRelevanceScore, IndustryFit, and ImplementationEffort.
  2. The output passes the contract test.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval
