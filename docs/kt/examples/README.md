---
title: Examples index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Examples

Long examples and schemas live here as YAML or JSON files so the KT documents stay small. `scripts/check-config.py` parses every file here. The examples use the field names of the [agent contracts](../agents/README.md) and are validated against the schemas in `packages/models` once those exist. They show the `Output` shape only; Evidence and the rest of the envelope from [contract conventions](../agents/contract-conventions.md) are omitted for brevity and belong in golden-set fixtures.

- [context-switching-opportunity.yaml](context-switching-opportunity.yaml): a complete opportunity for a research finding about context switching, with every agent output and the score computed with the rules of ADR 0005.
- [no-opportunity.yaml](no-opportunity.yaml): a publication that passes triage but yields no candidate opportunity (matches the [extraction contract](../agents/opportunity-extraction.md)).
