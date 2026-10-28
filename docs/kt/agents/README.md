---
title: Agents index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Multi-agent framework

The multi-agent engine runs on LangGraph with OpenAI or Anthropic models (CrewAI is optional). Each agent has one responsibility and returns a fixed output contract. Field types and value ranges are not specified yet; define them in each agent document before implementing the agent.

| Agent | Document | Requirement |
|---|---|---|
| Research Analyst | [research-analyst.md](research-analyst.md) | REQ-AGENT-001 |
| Problem Discovery | [problem-discovery.md](problem-discovery.md) | REQ-AGENT-002 |
| Market Analysis | [market-analysis.md](market-analysis.md) | REQ-AGENT-003 |
| Competition | [competition.md](competition.md) | REQ-AGENT-004 |
| Startup Generator | [startup-generator.md](startup-generator.md) | REQ-AGENT-005 |
| Relevance | [relevance.md](relevance.md) | REQ-AGENT-006 |
