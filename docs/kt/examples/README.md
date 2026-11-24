---
title: Examples index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
---

# Examples

Long examples and schemas live here as YAML or JSON files so the KT documents stay small. `scripts/check-config.py` parses every file here. The examples use the field names of the [agent contracts](../agents/README.md). `packages/models/src/examples.test.ts` validates them against the schemas in `packages/models` (REQ-PROC-007 AC3). In a product example each agent section is the agent's output with its evidence items beside it under `Evidence` (REQ-AGENT-008); in a stored envelope the evidence sits next to `Output`, not inside it. The thin slice uses these sections as its stub outputs. Full envelopes (model, prompt version, run ID) belong in [golden-set fixtures](../test/golden-sets.md).

- [context-switching-opportunity.yaml](context-switching-opportunity.yaml): a complete opportunity for a research finding about context switching, with every agent output and the score computed with the rules of ADR 0005.
- [no-opportunity.yaml](no-opportunity.yaml): a publication that passes triage but yields no candidate opportunity (matches the [extraction contract](../agents/opportunity-extraction.md)).
