---
title: Ingestion scope
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-03
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009, REQ-PROC-005, REQ-PROC-006]
---

# Ingestion scope

The locked pilot scope for phase 1. It is deliberately narrow: measure volume and cost, then widen it by changing configuration (answered OQ-012). Values marked provisional may change after phase 1 measurements without changing the topic map.

## Pilot values

| Setting | Pilot value | Locked? |
|---|---|---|
| arXiv categories | `cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` (primary or cross-listed) | locked for phase 1 |
| OpenAlex window | works published in the last 90 days at the first run (REQ-DATA-009, ADR 0035), then incremental; never older than 90 days before the day of a run | locked for phase 1 |
| OpenAlex topics | topics whose field or subfield appears in the topic map below | locked names; subfield IDs still to be filled (see below) |
| Languages | English only (also the language of the interface, agent outputs, and briefs) | locked |
| Daily limit to extraction | 100 publications | provisional until phase 1 volume is measured |
| Day boundary | UTC | locked |

The manual workflow `OpenAlex scope lookup` (`.github/workflows/openalex-scope-lookup.yml`, `pnpm --filter @roi/pipeline scope-lookup`) reads the OpenAlex taxonomy with the staging key and prints, for each topic-map name, the matching fields and subfields with their IDs, which names have no exact match, and the number of works per subfield in a window. It stores nothing and downloads no works.

The OpenAlex request filters on subfield IDs, but the IDs are not looked up yet: `OpenAlexScope.SubfieldIds` in `apps/pipeline/src/config.ts` is empty. Until it is filled, only the name check keeps out-of-scope works from being stored, and the collector still downloads them (they count as `Skipped`). Look the IDs up in the OpenAlex taxonomy with an API key, store them in that setting, and compare the `Skipped` share of `Staging measure` before and after. The names in the map must also match the names OpenAlex returns; a name that never matches silently drops its works, so check the `Skipped` share on the first staging runs.

The limit and the map are configuration, not code. Changing them is a reviewed pull request that records the reason.

## Topic map

A publication is in scope (REQ-PROC-006) when at least one of its OpenAlex subfields, or one of its arXiv categories, maps to a target industry or is a cross-industry computing category. The map covers the eight target industries of ADR 0037 and is recorded in [ADR 0038](../decisions/0038-topic-map-for-eight-industries.md). The code mirrors it in `apps/pipeline/src/normalize/scope.ts`. The names are OpenAlex subfield names, spelled as the taxonomy spells them (checked against the taxonomy on 2026-11-03); look up their IDs when the collector is configured and store the IDs in configuration. A publication that fits none of the eight industries (`other`) has no row and is in scope only through a cross-industry category.

| Industry | OpenAlex subfields (names) | arXiv categories |
|---|---|---|
| Automotive | Automotive Engineering; Control and Systems Engineering; Mechanical Engineering; Industrial and Manufacturing Engineering; Safety, Risk, Reliability and Quality; Transportation | `cs.RO`, `eess.SY` |
| Aerospace & Defense | Aerospace Engineering; Space and Planetary Science; Control and Systems Engineering; Safety, Risk, Reliability and Quality; Signal Processing | `cs.RO`, `eess.SY`, `eess.SP`, `astro-ph.IM`, `physics.space-ph` |
| Consumer Products & Retail | Marketing; Strategy and Management; Business and International Management; Management Science and Operations Research; Food Science | `cs.IR`, `econ.GN`, `stat.AP` |
| Energy & Utilities | Energy Engineering and Power Technology; Renewable Energy, Sustainability and the Environment; Fuel Technology; Nuclear Energy and Engineering; Electrical and Electronic Engineering | `eess.SY`, `math.OC` |
| Banking (Finance) | Finance; Accounting; Economics and Econometrics; Management Information Systems; Information Systems | `q-fin.CP`, `q-fin.GN`, `q-fin.PM`, `q-fin.RM`, `q-fin.ST`, `q-fin.TR`, `econ.GN` |
| Insurance | Finance; Economics and Econometrics; Statistics, Probability and Uncertainty | `q-fin.RM`, `stat.AP` |
| Public Sector | Public Administration; Law; Political Science and International Relations; Information Systems; Urban Studies | `cs.CY` |
| Life Sciences | Pharmaceutical Science; Drug Discovery; Pharmacology; Biotechnology; Molecular Medicine; Biomedical Engineering; Health Informatics; Radiology, Nuclear Medicine and Imaging; Epidemiology | `q-bio.QM`, `q-bio.BM`, `q-bio.GN`, `physics.med-ph`, `eess.IV` |
| Cross-industry (no single industry) | Software; Human-Computer Interaction | `cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` |

- The cross-industry row keeps the computing categories of the pilot map, so the move to eight industries does not narrow what arXiv delivers. Industry-agnostic AI work reaches the pipeline through it, and the Relevance agent decides the industry (REQ-AGENT-006).
- The pilot map used names that OpenAlex does not return as subfields (for example `Software engineering`, `Public health`, `Clinical medicine`, `Political science`, and `Radiology and imaging`). Works with those subfields were skipped by the name check. The new map uses only names that exist in the taxonomy.
- The map widens the arXiv query from 4 to 24 categories. The volume per category is not measured. Review the map with the `Staging measure` report before the first ingest beyond the pilot, and drop or narrow a row whose share of publications that pass triage is too low.

## Measure in phase 1

- Publications per day per source (by publication date).
- Share of publications with an abstract, complete records, and a storable PDF (ADR 0014), and what happened to the PDF messages.
- Runs per day with their outcome, dead-lettered messages, flagged duplicates, and alerts.
- The cost per publication as an **estimate** (ADR 0032). Phase 1 makes no model calls, so triage and extraction are not measured. The estimate takes the real mean abstract length, the stated prompt sizes, and the price of the configured model from `infrastructure/cloudflare/measure/cost-assumptions.json`. A price left empty is reported as missing, never guessed. Phase 2 replaces the estimate with the first measured cost.

How: the manual workflow `Staging measure` runs read-only queries against the staging database and prints the report (`pnpm --filter @roi/cloudflare-infra measure --env staging`). Run it a few days after the first scheduled runs. A run that stopped at the page cap (`ingestion.max_pages_per_run`) makes the counts lower bounds, and the daily figure sums both sources, so a publication found in both counts twice: the figures are upper bounds for the cost and lower bounds for the share of coverage, and are read that way.

Phase 2 does not start until the phase 1 measurements give a complete estimate of the cost per publication (REQ-NFR-005). Widen the scope only when the measured cost per complete opportunity fits the calibrated budget (OQ-021).

## Results

Not measured yet. After the first scheduled runs on staging, the report of `Staging measure` is recorded here, with its date, the page cap status, and the assumptions used.
