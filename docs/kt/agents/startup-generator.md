---
title: Startup Generator Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-005]
---

# Startup Generator Agent

Requirement: REQ-AGENT-005. Covers the Startup Generation and Business Case Creation steps of the core workflow. Its output does not feed a score category.

## Responsible for

- SaaS, platform, AI, and enterprise product concepts
- business model and pricing
- a short business case and the next steps

## Inputs

- Problem Discovery, Market Analysis, and Competition outputs.
- Research Analyst output: technologies and maturity.

## Output contract

```yaml
StartupName: string(max 40)                 # a working title, not checked for trademarks
OpportunityType: enum [saas, platform, ai-solution, enterprise-software, digital-service]
ValueProposition: string(max 280)
TargetCustomer: string(max 120)             # consistent with Problem Discovery Customer
BusinessModel: enum [subscription, usage-based, license, services, marketplace]
Pricing:
  Model: enum [per-user, per-usage, flat, tiered]
  Price: Money
  Unit: string(max 40)                      # for example "user per month"
USP: string(max 280)                        # consistent with Competition Differentiation
MvpFeatures: list<string(max 120)> (3..7)
NextSteps: list<string(max 160)> (3..5)
BusinessCase:
  Summary: string(max 600)
  KeyAssumptions: list<string(max 200)> (2..5)
  KeyRisks: list<string(max 200)> (2..5)
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

- NextSteps are concrete actions a team can start this quarter, for example "interview five HR leads about focus time".
- The concept stays within the research finding; features that the publication does not support are listed as assumptions.

## Evals

Golden set entries hold the required elements of the concept and check consistency with the Problem Discovery and Competition outputs. A model judge grades the value proposition and next steps with a rubric (see [AI evals](../test/ai-evals.md)).
