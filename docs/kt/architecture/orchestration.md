---
title: Pipeline orchestration
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-007, REQ-AGENT-009, REQ-PROC-004, REQ-PROC-005]
---

# Pipeline orchestration

This document describes how one publication becomes zero or more scored opportunities. The runtime is proposed in ADR 0003 and the service mapping in ADR 0004.

## Core workflow mapping

| Core workflow step ([overview](../overview.md)) | Component | Requirement |
|---|---|---|
| Scientific Research | Collector and triage | REQ-DATA-001, REQ-DATA-002, REQ-PROC-005 |
| Problem Discovery | Research Analyst, then Problem Discovery | REQ-AGENT-001, REQ-AGENT-002 |
| Market Analysis | Market Analysis | REQ-AGENT-003 |
| Competitive Analysis | Competition | REQ-AGENT-004 |
| Software Opportunity Discovery | Opportunity extraction | REQ-PROC-004 |
| Startup Generation | Startup Generator | REQ-AGENT-005 |
| Business Case Creation | Startup Generator (BusinessCase) | REQ-AGENT-005 |
| Opportunity Scoring | Relevance, then the scoring engine | REQ-AGENT-006, REQ-SCORE-001 |

In the running pipeline, extraction comes first: it turns a publication into candidates, and the agents analyze each candidate. The extraction output contract is in [opportunity extraction](../agents/opportunity-extraction.md).

## Pipeline

```text
publication
  └─ triage (rules, then a cheap model)            REQ-PROC-005
      └─ opportunity extraction → 0..N candidates   REQ-PROC-004
          └─ per candidate:
              Research Analyst                      REQ-AGENT-001
              Problem Discovery                     REQ-AGENT-002
              ├─ Market Analysis      (parallel)    REQ-AGENT-003
              ├─ Competition          (parallel)    REQ-AGENT-004
              └─ Relevance            (parallel)    REQ-AGENT-006
              Startup Generator                     REQ-AGENT-005
              scoring engine (plain code)           REQ-SCORE-001
```

Market Analysis, Competition, and Relevance depend only on the Research Analyst and Problem Discovery outputs, so they run in parallel. The Startup Generator waits for Market Analysis, Competition, and Relevance because it uses all three (constraints and effort from Relevance shape NextSteps and KeyRisks).

## State and durability

- Each step is a durable step: its output is stored with the run ID before the next step starts (REQ-AGENT-007). A resumed run skips completed steps.
- Steps pass record IDs, not large payloads. Each step loads its inputs from storage.
- The candidate is the unit of work. One failed candidate does not stop the other candidates of the same publication.

## Retries and failure

| Failure | Handling |
|---|---|
| Output does not match the contract | Retry with the validation errors, up to three attempts (REQ-AGENT-009). |
| Evidence quote not found in the input | Treated as invalid output. |
| Provider error or timeout | Retry with backoff; counts toward the same attempt limit. |
| Daily budget reached | No new runs start; running steps finish (REQ-NFR-005). |
| Final failure | Step marked failed with errors stored; the opportunity is incomplete and not scored (REQ-SCORE-005). |

## Models and prompts

- The model for each agent is configuration, not code. Every call goes through AI Gateway (REQ-NFR-003).
- Prompts live in `packages/prompts`, one versioned prompt per agent. The version is stored in the output envelope (see [contract conventions](../agents/contract-conventions.md)).
- Changing a prompt or a model triggers the evals for that agent (REQ-TEST-004).
- Temperature and other sampling settings are part of the model configuration and are versioned with it.

## Human review

The MVP has no review step inside the pipeline. Reviewers judge output through the dashboard and, later, through feedback (REQ-DASH-004).
