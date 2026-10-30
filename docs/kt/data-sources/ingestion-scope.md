---
title: Ingestion scope
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009, REQ-PROC-005, REQ-PROC-006]
---

# Ingestion scope

The locked pilot scope for phase 1. It is deliberately narrow: measure volume and cost, then widen it by changing configuration (answered OQ-012). Values marked provisional may change after phase 1 measurements without changing the topic map.

## Pilot values

| Setting | Pilot value | Locked? |
|---|---|---|
| arXiv categories | `cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` (primary or cross-listed) | locked for phase 1 |
| OpenAlex window | works published in the last 30 days at the first run (REQ-DATA-009), then incremental | locked for phase 1 |
| OpenAlex topics | topics whose field or subfield appears in the topic map below | locked names; IDs filled when the collector is built |
| Languages | English only (also the language of the interface, agent outputs, and briefs) | locked |
| Daily limit to extraction | 100 publications | provisional until phase 1 volume is measured |
| Day boundary | UTC | locked |

The limit and the map are configuration, not code. Changing them is a reviewed pull request that records the reason.

## Topic map

A publication is in scope (REQ-PROC-006) when at least one of its OpenAlex fields or subfields, or one of its arXiv categories, maps to a target industry. The map names OpenAlex fields and subfields; look up their IDs in OpenAlex when the collector is built and store the IDs in configuration.

| Industry | OpenAlex fields and subfields (names) | arXiv categories |
|---|---|---|
| Government | Public administration; Law; Political science; Information systems | `cs.CY` |
| Healthcare | Health informatics; Radiology and imaging; Public health; Clinical medicine | `cs.AI`, `cs.HC` |
| Financial services | Finance; Accounting; Economics and econometrics; Information systems | `cs.CY`, `cs.AI` |
| Enterprise | Management information systems; Software engineering; Human-computer interaction; Organizational behavior | `cs.SE`, `cs.HC`, `cs.AI` |

## Measure in phase 1

- Publications per day per source, and how many pass triage.
- Share of publications with an abstract and with a storable PDF (ADR 0014).
- Cost of triage and extraction per publication (REQ-NFR-005).

Phase 2 does not start until the phase 1 measurements give a cost per publication (REQ-NFR-005). Widen the scope only when the measured cost per complete opportunity fits the calibrated budget (OQ-021).
