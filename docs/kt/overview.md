---
title: Overview
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Overview

## Problem

Innovation teams, consultants, and venture builders spend hundreds of hours manually reviewing research papers to identify commercially viable opportunities. Most promising discoveries never reach the market because there is no scalable process for translating scientific findings into validated software concepts.

Organizations depend on individual experts, consultants, research departments, and chance discoveries to spot what new research could mean for them. That approach does not scale, and its results are hard to compare or trace back to their sources.

## Goal

Transform scientific research into validated software opportunities, startup concepts, and enterprise innovation initiatives. The platform automatically analyzes scientific publications and identifies opportunities of these types:

- SaaS products
- AI solutions
- Digital services
- Enterprise software

for these target industries: government, healthcare, financial services, and enterprise (see [Target industries](#target-industries)).

In this documentation, a **validated** opportunity is one whose every claim cites a verifiable source or is labeled as an estimate, whose score can be explained category by category, and which a user has reviewed. The platform prepares the evidence; people make the final call.

## Users

| User | Job to be done | What they need from the platform |
|---|---|---|
| Innovation lead in an enterprise or government organization | Decide which new developments to explore this year | A ranked, explained shortlist for their industry |
| Consultant | Bring evidence-based ideas to a client | Opportunities with sources, market figures, and competitors |
| Venture builder | Find startup concepts worth validating | Concepts with a business case and next steps |
| Domain reviewer | Judge whether the platform's output is right | Golden sets, evidence, and a way to record feedback |

The MVP serves invited users in one shared workspace (OQ-010 in [open questions](open-questions.md)).

## Vision

Thousands of scientific papers are published every day. Most never reach product teams, entrepreneurs, innovation departments, government organizations, or consulting firms. The platform continuously scans new research, extracts problems worth solving, identifies market gaps, and generates validated software concepts.

The platform connects scientific research with practical innovation. It replaces chance discovery with a scalable, consistent, and traceable process. It ingests new publications from OpenAlex, arXiv, and Semantic Scholar, derives software opportunities from them, and scores each opportunity on scientific novelty, market potential, competitive gap, technical feasibility, and strategic relevance (see [Opportunity scoring](scoring.md)).

OpenAlex covers all disciplines, including the management, health, and social science research behind many opportunities; arXiv adds early preprints in computer science (see [data sources](data-sources/README.md)).

### A decision platform, not a search engine

The platform is not a search engine for research. It is a platform for innovation decisions. Users see more than what has been published. They see which developments matter, which problems they solve, which market gaps they open, which organizations could benefit, and which concrete next steps to take.

Users do not need a research background to benefit from scientific progress. The platform translates complex findings into clear, evidence-based software opportunities that enterprises, government organizations, and other organizations can act on.

### Principles

| Principle | Meaning | Requirements |
|---|---|---|
| **Relevance** | An opportunity matters to the user's industry and strategy. | REQ-AGENT-006, REQ-DASH-005 |
| **Reliability** | Every recommendation cites verifiable source publications, and its score can be explained category by category. | REQ-AGENT-008, REQ-SCORE-004, REQ-API-002 |
| **Actionability** | Every recommendation leads to a concrete decision or next step. | REQ-AGENT-005, REQ-DASH-001 |

### Long-term objective

The long-term objective is an autonomous platform. It ingests, analyzes, and scores research end to end without manual steps, and shortens the path from scientific discovery to economic and societal value. Later phases may add market signals, technology trends, and feedback on the opportunities that organizations pursued (REQ-DASH-004), so the platform can show emerging opportunities earlier than traditional market analysis does. None of these sources is in scope for the MVP (see [Roadmap](roadmap.md)).

Organizations should no longer have to ask "Which innovations exist?". Instead, the platform continuously answers:

> Which newly published scientific discoveries have the highest probability of becoming successful software products for enterprise, government, healthcare, and financial services organizations?

For a single organization, that becomes: which developments will change our market, our customers, and our services in the coming years, and which opportunities should we act on today? Answering that needs an organization profile (REQ-DASH-005), which comes after the MVP.

## Success measures

The targets below are provisional. They are fixed before phase 1 starts and are reviewed once, with data, at the end of phase 3 (OQ-032). A baseline method is agreed with the same review.

| Measure | How it is measured | Provisional target |
|---|---|---|
| Precision | Share of High and Exceptional opportunities that reviewers judge worth exploring | at least 50 % |
| Explainability | Share of opportunities whose claims all have evidence or an estimate label | at least 95 % |
| Time saved | Reviewer time per useful opportunity, compared with manual review of the same number of papers, measured with three reviewers on a sample of 20 papers | at most 25 % of the manual time |
| Agreement | Rank correlation between scores and reviewer ranking (REQ-SCORE-006) | Spearman at least 0.6, with its 95 % interval |
| Cost | Model cost per complete opportunity (REQ-NFR-005) | at most EUR 2 until the calibrated budget (OQ-021) |

## Non-goals for the MVP

- A general search engine or reference manager for research.
- Investment, legal, or medical advice. Market figures are estimates to support a decision, not a valuation.
- Patents, grants, and news as sources.
- Validating opportunities with customers; the platform prepares the next steps, people carry them out.
- Multiple organizations with separate data (later, REQ-DASH-005).

## Core workflow

```text
Scientific Research
        ↓
Problem Discovery
        ↓
Market Analysis
        ↓
Competitive Analysis
        ↓
Software Opportunity Discovery
        ↓
Startup Generation
        ↓
Business Case Creation
        ↓
Opportunity Scoring
```

[Orchestration](architecture/orchestration.md) maps each step to a component and gives the order in which the pipeline runs them.

## Target industries

| Industry | Focus areas |
|---|---|
| Government | Public services, digital citizens, case management, self-service platforms, fraud detection, AI assistants |
| Healthcare | Clinical decision support, patient engagement, workforce planning, diagnostics, predictive analytics |
| Financial services | Risk management, compliance automation, fraud prevention, customer service automation |
| Enterprise | Employee experience, process automation, workforce optimization, knowledge management |

## Example

Research finding: context switching causes significant productivity loss among knowledge workers. The platform output for that finding is in [examples/context-switching-opportunity.yaml](examples/context-switching-opportunity.yaml). A publication that yields no opportunity is in [examples/no-opportunity.yaml](examples/no-opportunity.yaml).
