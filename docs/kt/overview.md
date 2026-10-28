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

Transform scientific research into validated software opportunities, startup concepts, and enterprise innovation initiatives. The platform automatically analyzes scientific publications and identifies opportunities for:

- SaaS products
- AI solutions
- Digital services
- Enterprise software
- Government innovation
- Healthcare innovation
- Financial services innovation

## Vision

Thousands of scientific papers are published every day. Most never reach product teams, entrepreneurs, innovation departments, government organizations, or consulting firms. The platform continuously scans new research, extracts problems worth solving, identifies market gaps, and generates validated software concepts.

The platform connects scientific research with practical innovation. It replaces chance discovery with a scalable, consistent, and traceable process. It ingests new publications from OpenAlex, arXiv, and Semantic Scholar, derives software opportunities from them, and scores each opportunity on scientific novelty, market potential, competitive gap, technical feasibility, and strategic relevance (see [Opportunity scoring](scoring.md)).

### A decision platform, not a search engine

The platform is not a search engine for research. It is a platform for innovation decisions. Users see more than what has been published. They see which developments matter, which problems they solve, which market gaps they open, which organizations could benefit, and which concrete next steps to take.

Users do not need a research background to benefit from scientific progress. The platform translates complex findings into clear, evidence-based software opportunities that enterprises, government organizations, and other organizations can act on.

### Principles

- **Relevance**: an opportunity matters to the user's industry and strategy.
- **Reliability**: every recommendation cites verifiable source publications, and its score can be explained category by category.
- **Actionability**: every recommendation leads to a concrete decision or next step.

### Long-term objective

The long-term objective is an autonomous platform. It ingests, analyzes, and scores research end to end without manual steps, and shortens the path from scientific discovery to economic and societal value. Later phases may add market signals, technology trends, and feedback on the opportunities that organizations pursued, so the platform can show emerging opportunities earlier than traditional market analysis does. None of these sources is in scope for the MVP (see [Roadmap](roadmap.md)).

Organizations should no longer have to ask "Which innovations exist?". Instead, the platform continuously answers:

> Which newly published scientific discoveries have the highest probability of becoming successful software products for enterprise, government, healthcare, and financial services organizations?

For a single organization, that becomes: which developments will change our market, our customers, and our services in the coming years, and which opportunities should we act on today?

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

## Target industries

| Industry | Focus areas |
|---|---|
| Government | Public services, digital citizens, case management, self-service platforms, fraud detection, AI assistants |
| Healthcare | Clinical decision support, patient engagement, workforce planning, diagnostics, predictive analytics |
| Financial services | Risk management, compliance automation, fraud prevention, customer service automation |
| Enterprise | Employee experience, process automation, workforce optimization, knowledge management |

## Example

Research finding: context switching causes significant productivity loss among knowledge workers. The platform output for that finding is in [examples/context-switching-opportunity.yaml](examples/context-switching-opportunity.yaml).
