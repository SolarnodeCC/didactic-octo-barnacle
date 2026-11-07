---
title: Ingestion scope
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-DATA-001, REQ-DATA-002, REQ-DATA-009, REQ-PROC-005, REQ-PROC-006]
---

# Ingestion scope

The locked pilot scope for phase 1. It is deliberately narrow: measure volume and cost, then widen it by changing configuration (answered OQ-012). Values marked provisional may change after phase 1 measurements without changing the topic map.

## Pilot values

| Setting | Pilot value | Locked? |
|---|---|---|
| arXiv categories | `cs.AI`, `cs.SE`, `cs.HC`, `cs.CY` (primary or cross-listed) | locked for phase 1 |
| OpenAlex window | works published in the last 14 days at the first run (REQ-DATA-009, ADR 0041), then incremental; never older than 90 days before the day of a run | locked for phase 1 |
| OpenAlex topics | works whose primary topic has a field or subfield in the topic map below (ADR 0041) | locked names; subfield IDs still to be filled (see below) |
| OpenAlex work types | `article`, `preprint`, `review`, `conference-paper`, with an abstract (ADR 0048) | locked for phase 1 |
| Languages | English only (also the language of the interface, agent outputs, and briefs) | locked |
| Daily limit to extraction | 100 publications | provisional until phase 1 volume is measured |
| Day boundary | UTC | locked |

The manual workflow `OpenAlex scope lookup` (`.github/workflows/openalex-scope-lookup.yml`, `pnpm --filter @roi/pipeline scope-lookup`) reads the OpenAlex taxonomy with the staging key and prints, for each topic-map name, the matching fields and subfields with their IDs, which names have no exact match, and the number of works per subfield in a window. It stores nothing and downloads no works.

The OpenAlex request filters on the subfield ID of the primary topic (ADR 0041). `OpenAlexScope.SubfieldIds` in `apps/pipeline/src/config.ts` holds the IDs of every subfield name in the map (`OPENALEX_SUBFIELD_IDS` in `apps/pipeline/src/normalize/scope.ts`, looked up in the OpenAlex taxonomy on 2026-11-03), so the collector no longer downloads works outside the map. The name check in the ingest step stays as a second guard. A change to the map changes both the names and the IDs, and a test fails when a name has no ID. Compare the `Skipped` share of `Staging measure` before and after the first staging runs with the IDs; a name that never matches silently drops its works.

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

### 6 November 2026

`Staging scheduled checks` run 14, at 14:58 UTC. The data covers the runs from 31 October to the morning of 6 November, before the deploy of 6 November 12:39 UTC that brought delayed retries (ADR 0045), the D1 query cuts, and the PDF queue (ADR 0047). Read it as the baseline for those changes.

**Page cap:** 18 of 22 runs stopped at the page cap, so every volume below is a lower bound.

| Measure | arXiv | OpenAlex |
|---|---|---|
| Publications stored | 13,372 | 14,028 |
| Publication days | 744 (preprints from before ADR 0042) | 242 |
| Mean per day | 18.0 | 58.0 |
| Largest day | 544 | 4,090 |
| With abstract and complete | 100.0 % | 79.4 % |
| Storable PDF | 0.1 % | 18.7 % |

- **Runs:** 22 in total; 0 succeeded, 18 partial, and 4 failed. 15 messages were dead-lettered, and 122 duplicates were flagged for review.
- **PDFs:** 1,515 stored. Of the PDF messages, 990 ended on an HTTP error status, 73 were not a PDF, 20 were blocked URLs, 9 had too many redirects, and 11 were dead-lettered.

**Cost per publication (ESTIMATE, ADR 0032).** The mean abstract is 373 tokens. The prices are those of the dearer benchmark candidate per step, because no model is configured yet (OQ-036):

- triage on `glm-4.7-flash` at USD 0.06 / 0.40;
- extraction on `deepseek-v4.1-flash-1017` at USD 0.30 / 1.20.

The prices are per million input / output tokens, read on 6 November 2026 and converted at the ECB rate of 1.1165 USD per EUR. Prompt and output tokens are the placeholders in `cost-assumptions.json`.

| Figure | EUR |
|---|---|
| Triage, per publication | 0.00008 |
| Extraction, per publication | 0.00136 |
| **Per publication (triage plus extraction)** | **0.0014** |
| Per day at the mean of 31 publications | 0.045 |
| Per day at the largest day so far (4,634 publications, at most 100 extracted) | 0.52 |
| Provisional phase 2 budget (OQ-013: 100 × cost × 1.5) | 0.22 per day |

All figures are upper bounds for the cost. Replace them when OQ-036 picks the models and the first model calls of phase 2 give a measured cost (REQ-NFR-005).

**Phase 1 exit data check (ADR 0051).** The exit needs at least 1,000 publications with a title and an abstract per source, over at least 7 publication days. This report meets it: arXiv 13,372 stored, all with abstract, over 744 publication days; OpenAlex about 11,100 of 14,028 with abstract, over 242 publication days. The daily volume above is a lower bound for the pipeline; the OpenAlex API count of ADR 0048 is about 3,400 works a day under the current filter.

### 7 November 2026

Read-only queries on the staging database at about 09:00 UTC, after the scheduled runs of 7 November (OpenAlex 06:00, arXiv 07:30 UTC) and the deploys of 6 November with the ADR 0048 filter. The `Staging scheduled checks` workflow could not be started from the agent session (HTTP 403 on the dispatch), so these figures come from the queries, not from that report. Counts only; no publication text was read.

**Runs:** 24 in total; 1 succeeded, 19 partial, and 4 failed. The two new runs:

| Run | Status | Window | Fetched | Created | Updated | Skipped | Failed | Dead-lettered |
|---|---|---|---|---|---|---|---|---|
| arXiv, 07:30 | **succeeded** (16 pages) | 23 Oct to 6 Nov | 1,539 | 662 | 1 | 876 | 0 | 0 |
| OpenAlex, 06:00 | partial (page cap of 50) | 23 Oct to 6 Nov | 5,000 | 4,991 | 9 | 0 | 0 | 0 |

The arXiv run is the first run of any source that finished its window. OpenAlex still stops at the page cap, as ADR 0048 expected.

**Data criterion of the phase 1 exit (ADR 0051): met.**

| Measure | arXiv | OpenAlex |
|---|---|---|
| Publications stored | 14,035 | 19,026 |
| With abstract | 14,035 (100.0 %) | 16,134 (84.8 %) |
| Publication days with an abstract | 744 | 175 |
| Stored by the run of 7 November | 662, all with abstract | 4,991, all with abstract |

- Since the ADR 0048 filter, every OpenAlex work stored has an abstract (4,991 of 4,991, against 79.4 % before).
- Within the last 90 days, OpenAlex holds 15,353 works with an abstract over 91 publication days.
- 613 OpenAlex works carry a publication date after 7 November 2026, up to November 2027. All were stored by runs before the ADR 0048 filter (the last on 6 November at 06:11 UTC); the run of 7 November stored none. REQ-DATA-009 AC3 limits how old a publication may be, not how far in the future its date may be.

**Queue:** 3,748 `document.ingest` messages completed and 16 were dead-lettered. Five of them are new today, between 06:13 and 06:38 UTC, and ended on HTTP 503, 429, 429, 530, and 429 from the PDF hosts (alert issue 91). The 4 dead-lettered `source.fetch_page` messages are from 31 October to 4 November. In all, 20 messages are dead-lettered (15 on 6 November). The document queue retries a 429 and a 5xx, and has no limit per host.

