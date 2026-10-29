---
title: Agents index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Multi-agent framework

The multi-agent engine runs on LangGraph with OpenAI or Anthropic models (ADR 0003 proposes LangGraph.js and dropping CrewAI). Each agent has one responsibility, receives fixed inputs, and returns a typed output contract. How the agents are chained is described in [orchestration](../architecture/orchestration.md).

- [Contract conventions](contract-conventions.md): type notation, the envelope every output carries, evidence, and failure rules that apply to all agents.

| Agent | Document | Requirement | Feeds score category |
|---|---|---|---|
| Research Analyst | [research-analyst.md](research-analyst.md) | REQ-AGENT-001 | Scientific Novelty |
| Problem Discovery | [problem-discovery.md](problem-discovery.md) | REQ-AGENT-002 | Market Potential (pain level) |
| Market Analysis | [market-analysis.md](market-analysis.md) | REQ-AGENT-003 | Market Potential |
| Competition | [competition.md](competition.md) | REQ-AGENT-004 | Competitive Gap |
| Startup Generator | [startup-generator.md](startup-generator.md) | REQ-AGENT-005 | none (concept and business case) |
| Relevance | [relevance.md](relevance.md) | REQ-AGENT-006 | Strategic Relevance, Technical Feasibility |

Opportunity extraction (REQ-PROC-004) is a model-backed step before the agents. It follows the same contract conventions; its output contract is in [opportunity-extraction.md](opportunity-extraction.md). How it sits in the pipeline is in [orchestration](../architecture/orchestration.md).

| Step | Document | Requirement | Feeds score category |
|---|---|---|---|
| Opportunity extraction | [opportunity-extraction.md](opportunity-extraction.md) | REQ-PROC-004 | none (produces candidates) |

## Every agent document holds

1. **Responsible for**: what the agent decides, and what it leaves to other agents.
2. **Inputs**: the fields it receives. Nothing else is passed in.
3. **Output contract**: fields, types, ranges, and which fields need evidence.
4. **Rules**: rubrics and constraints the output must follow.
5. **Evals**: what the golden set checks for this agent.
