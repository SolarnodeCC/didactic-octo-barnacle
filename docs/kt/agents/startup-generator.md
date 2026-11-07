---
title: Startup Generator Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-04
related: [REQ-AGENT-005, REQ-AGENT-015]
---

# Startup Generator Agent

Requirements: REQ-AGENT-005 and REQ-AGENT-015 (validation brief). Covers the Startup Generation and Business Case Creation steps of the core workflow. Its output does not feed a score category.

## Responsible for

- SaaS, AI, digital-service, and enterprise product concepts
- business model and pricing
- a short business case and the next steps
- a validation brief: a kill question and a stop criterion per element (ADR 0040)

## Inputs

- Problem Discovery, Market Analysis, Competition, and Relevance outputs.
- Research Analyst output: technologies and maturity.
- The candidate from extraction: `Finding`, `Customer`, and, when set, `WhyNow` and `CurrentAlternative`, each with its quote (ADR 0070).

## Output contract

```yaml
StartupName: string(max 40)                 # a working title, not checked for trademarks
OpportunityType: enum [saas, ai-solution, enterprise-software, digital-service]
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
ValidationBrief:                            # generated text, no evidence, never scored
  Problem: BriefEntry
  Customer: BriefEntry
  Market: BriefEntry
  ReasonToWin: BriefEntry
  WhyNow: BriefEntry
Confidence: number 0..1
Notes: string(max 400)?

BriefEntry:
  KillQuestion: string(max 200)             # the one question whose answer would show the element false
  StopCriterion: string(max 200)            # when to drop the opportunity
```

## Rules

- NextSteps are concrete actions a team can start this quarter, for example "interview five HR leads about focus time".
- Relevance `Constraints` and `ImplementationEffort` must shape `KeyRisks` and `NextSteps` (for example consent, regulation, or specialist skills).
- The concept stays within the research finding; features that the publication does not support are listed as assumptions.
- When the candidate has `WhyNow`, the `WhyNow` brief entry starts from it; otherwise the entry says that the publication names no trigger (ADR 0070).
- The brief entries must be consistent with the inputs. They are not evidence, are not read by scoring or by the readiness label, and never state that an element has been validated.
- `OpportunityType` values match the types in the [overview](../overview.md) goal.

## Evals

Golden set entries hold the required elements of the concept and check consistency with the Problem Discovery and Competition outputs. A model judge grades the value proposition, the next steps, and the kill question and stop criterion of each brief entry with a rubric (see [AI evals](../test/ai-evals.md)).
