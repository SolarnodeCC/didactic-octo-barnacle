---
title: Agent requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
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
  2. A figure without a source is marked as an estimate. A figure with `Basis: sourced` cites a search result as `external-url` evidence (REQ-AGENT-013).
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
  2. Each competitor states whether it was verified against an external source; `Verified: true` requires a search result (REQ-AGENT-013).
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
  1. Every field marked "evidence required" in a contract has at least one evidence item. An item of kind `none-found` records that a search or comparison found nothing; it satisfies the requirement only for the fields whose contract allows it.
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

### REQ-AGENT-010: Structured model output

Every agent call asks the model for output that matches the agent's output contract through the provider's structured-output mechanism, not through prose instructions alone.

- Phase: 3
- Priority: must
- Status: planned
- Source: KT review of a comparable internal governance platform (typed output through forced tool use)
- Depends on: REQ-NFR-003, REQ-AGENT-009
- Acceptance criteria:
  1. Each agent call sends the contract schema from `packages/models` to the model through the provider's tool-use or JSON-schema mode, through AI Gateway, where the provider offers one.
  2. The returned output is always validated against the same schema before it is stored; a provider's claim that its output conforms is never accepted in place of validation.
  3. The mode used per agent and model is recorded in the envelope, and the golden set checks in phase 3 that the gateway passes the mode through.
  4. When a provider or model cannot enforce a schema, the call falls back to prompt instructions plus validation, and the envelope records the mode used in `OutputMode`.
- Verification: contract test with stubbed provider responses for each output mode

### REQ-AGENT-011: Repair of recoverable formatting errors

Output whose content is correct but whose wrapping is wrong is repaired by plain code before it counts as a failed attempt.

- Phase: 3
- Priority: should
- Status: planned
- Source: KT review of a comparable internal governance platform (an array returned as a double-encoded JSON string)
- Depends on: REQ-AGENT-009, REQ-NFR-008
- Acceptance criteria:
  1. The repair handles only the cases listed in [contract conventions](../agents/contract-conventions.md): a JSON-encoded string where the contract expects an array or object, and output wrapped in a markdown code fence.
  2. A repair never changes a value, adds a missing field, or fills a default. The repaired output is validated in full and its evidence is checked (REQ-AGENT-008).
  3. Every repair is recorded in the envelope field `Repairs`, and the run report shows the repair rate per agent and prompt version.
  4. A repaired output does not use up an attempt of REQ-AGENT-009; output that is still invalid after repair counts as a failed attempt.
- Verification: unit tests of the repair function and contract tests with malformed stubbed responses

### REQ-AGENT-012: Bounded model concurrency

The number of model calls in flight is limited across the whole platform, so a burst of runs does not exceed provider rate limits or overshoot the daily budget.

- Phase: 3
- Priority: must
- Status: planned
- Source: KT review of a comparable internal governance platform (cap on concurrent model calls)
- Depends on: REQ-AGENT-007, REQ-NFR-005
- Acceptance criteria:
  1. A configured maximum number of concurrent model calls per provider applies across all pipeline runs and all running instances, not per Worker instance. A Durable Object semaphore with lease timeouts enforces it (ADR 0017).
  2. A call above the limit waits; it is not dropped, and waiting does not count toward the attempt limit of REQ-AGENT-009.
  3. A provider rate-limit response (HTTP 429) is retried with backoff and respects a `Retry-After` header when present. It counts toward the attempt limit like other provider errors (see [orchestration](../architecture/orchestration.md)).
  4. The run report states the highest concurrency reached and the total time calls spent waiting.
- Verification: integration test with a stubbed gateway that records concurrent calls

### REQ-AGENT-013: Search tool for Market Analysis and Competition

Market Analysis and Competition can search the web for sources, under bounds and as untrusted input.

- Phase: 3
- Priority: must
- Status: planned
- Source: ADR 0013
- Depends on: REQ-AGENT-003, REQ-AGENT-004, REQ-NFR-006, REQ-NFR-005
- Acceptance criteria:
  1. Only these two agents have the tool. It returns titles, URLs, and snippets through a Worker; the model never calls the search provider directly.
  2. A step makes at most the configured number of tool calls and then answers in the contract. Search calls are recorded as model calls and count toward the daily budget (REQ-NFR-011, REQ-NFR-005).
  3. Tool results are delimited as untrusted data. Fixtures with injected instructions in a search result do not change the output beyond the contract (REQ-NFR-006).
  4. A competitor is `Verified: true` only when a result supports it. A figure is `Basis: sourced` only when it cites a result as `external-url` evidence with the retrieval date.
  5. Eval and contract tests use recorded search results and make no live search calls (REQ-TEST-003).
- Verification: contract tests with recorded tool results and injection fixtures, and eval

### REQ-AGENT-014: Pinned model versions

Every agent uses an exact model version, and a version change goes through the evals.

- Phase: 3
- Priority: must
- Status: planned
- Source: Readiness assessment
- Depends on: REQ-AGENT-010, REQ-TEST-004
- Acceptance criteria:
  1. The model configuration of each agent names an exact model version; floating aliases are not accepted by the configuration check.
  2. Changing a pinned version is a pull request that runs the agent's evals (REQ-TEST-004) and records the old and new version.
  3. The nightly eval run reports a provider deprecation or a behavior change for any pinned version, and the envelope stores the exact version used (see [contract conventions](../agents/contract-conventions.md)).
  4. A model that the provider retires is replaced before its retirement date; the run report lists pinned versions with their announced retirement dates.
- Verification: unit test of the configuration check and CI job
