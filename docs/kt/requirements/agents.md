---
title: Agent requirements
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
---

# Agent requirements

Each agent is described in [agents](../agents/README.md), with the shared rules in [contract conventions](../agents/contract-conventions.md) and the pipeline in [orchestration](../architecture/orchestration.md). In every agent requirement, "the contract" means the typed output contract in the agent's document, and "the eval threshold" means the threshold stored with the agent's golden set (see [AI evals](../test/ai-evals.md)).

### REQ-AGENT-001: Research Analyst Agent

Analyzes a publication for novelty, industry, technology, and confidence.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Depends on: REQ-PROC-003, REQ-PROC-004
- Acceptance criteria:
  1. The output matches the contract, including Novelty, Industry, Technology, and Confidence.
  2. Novelty is judged against the nearest publications from semantic search, which are listed in the output.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-002: Problem Discovery Agent

Identifies the problem, customer, and pain level behind a candidate opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Depends on: REQ-AGENT-001, REQ-PROC-004
- Acceptance criteria:
  1. The output matches the contract, including Problem, Customer, and PainLevel.
  2. PainLevel follows the rubric in the agent document.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-003: Market Analysis Agent

Estimates market size and growth for an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework and roadmap phase 3 (Market Analyzer)
- Depends on: REQ-AGENT-002
- Acceptance criteria:
  1. The output matches the contract, including TAM, SAM, and GrowthRate as ranges with currency, year, geography, and basis.
  2. A figure without a source is marked as an estimate.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-004: Competition Agent

Finds competitors and assesses the gap, saturation, and differentiation of an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework and roadmap phase 3 (Competitor Scanner)
- Depends on: REQ-AGENT-002
- Acceptance criteria:
  1. The output matches the contract, including Competitors, Saturation, Gap, GapStrength, and Differentiation.
  2. Each competitor states whether it was verified against an external source.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-005: Startup Generator Agent

Generates a startup concept and a short business case for an opportunity.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework, roadmap phase 3 (Startup Generator), and Core Workflow (Business Case Creation)
- Depends on: REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-006
- Acceptance criteria:
  1. The output matches the contract, including StartupName, BusinessModel, Pricing, USP, NextSteps, and BusinessCase.
  2. NextSteps holds three to five concrete actions and reflects Relevance constraints and effort when present.
  3. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-006: Relevance Agent

Scores strategic relevance for the target industries, technical feasibility, and implementation effort.

- Phase: 3
- Priority: must
- Status: planned
- Source: README Multi-Agent Framework
- Depends on: REQ-AGENT-001, REQ-AGENT-002
- Acceptance criteria:
  1. The output matches the contract, including StrategicRelevanceScore, IndustryFit for all four target industries, TechnicalFeasibility, and ImplementationEffort.
  2. The agent meets its eval threshold on the golden set.
- Verification: contract test and eval

### REQ-AGENT-007: Pipeline orchestration

The agents run as one durable pipeline per candidate opportunity, in the order described in [orchestration](../architecture/orchestration.md).

- Phase: 3
- Priority: must
- Status: planned
- Source: Core Workflow
- Depends on: REQ-AGENT-001, REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-005, REQ-AGENT-006
- Acceptance criteria:
  1. Each agent receives only the inputs listed in its document.
  2. A pipeline that stops halfway resumes from the last completed step without repeating completed model calls.
  3. Every agent output is stored with the pipeline run ID, model, and prompt version.
  4. An opportunity with a failed agent is marked incomplete and is not scored.
- Verification: integration test with stubbed model responses

### REQ-AGENT-008: Evidence for claims

Agent claims can be traced to a source.

- Phase: 3
- Priority: must
- Status: planned
- Source: overview principle Reliability
- Acceptance criteria:
  1. Every field marked "evidence required" in a contract has at least one evidence item.
  2. An evidence quote from the publication is checked to occur in the publication text the agent received; an output with a quote that does not occur is rejected.
  3. External sources are stored as URLs with the date they were retrieved.
- Verification: contract test and eval

### REQ-AGENT-009: Contract failure handling

Output that does not match the contract is retried a limited number of times and never passed on.

- Phase: 3
- Priority: must
- Status: planned
- Source: agents index (rejected and retried, never passed on)
- Acceptance criteria:
  1. Invalid output is retried up to the configured number of attempts, three by default, with the validation errors added to the retry.
  2. After the last attempt the step fails with the validation errors stored, and the opportunity is marked incomplete.
  3. Failed steps are listed in the run report (REQ-NFR-008).
- Verification: contract test with malformed stubbed responses
