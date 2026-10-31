---
title: "0032: The phase 1 cost per publication is an estimate from real data"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-NFR-005, REQ-DATA-009]
---

# 0032: The phase 1 cost per publication is an estimate from real data

- Decision status: Accepted
- Date: 2026-10-30

## Context

The phase 1 exit criterion, the phase 2 Definition of Ready, OQ-013, and REQ-NFR-005 all require a measured cost per publication before phase 2 starts. The model calls that cost money (triage and extraction) are built in phase 2. In phase 1 the platform fetches, stores, and reports on publications, but makes no model call, so the cost cannot be measured there. The rules as written ask for something phase 1 cannot produce.

## Options considered

1. **Leave the cost open.** Strictly follows the text, but phase 2 can never start.
2. **Estimate from real phase 1 data.** Measure the real volume per day and the real mean abstract length, and combine them with stated prompt sizes and the price of the configured model.
3. **Move the requirement to phase 2.** Honest, but the phase 2 budget formula needs a number at the start of phase 2.

## Decision

Option 2, labelled as an estimate everywhere it appears.

- **Definition.** The cost per publication is the cost of one triage call plus one extraction call for a publication, so every publication is assumed to reach extraction. This is the conservative reading of the OQ-013 formula: daily budget = `ingestion.daily_extraction_limit` × cost per publication × 1.5.
- **Inputs.** Measured: publications per day and the mean abstract length. Stated assumptions (`infrastructure/cloudflare/measure/cost-assumptions.json`, changed by reviewed pull request): characters per token, the prompt and output tokens of each step, and the price per million tokens of the model configured for each step. A price that is not filled in is reported as missing, never guessed, so the estimate is not complete until the owner supplies the current prices.
- **Replacement.** The first measured cost, from the first model calls in phase 2, replaces the estimate in the budget (REQ-NFR-005).
- **Reading the figures.** A run stopped by the page cap makes counts lower bounds, and the daily volume sums both sources, so a publication found in both counts twice. The cost figures are upper bounds.

## Consequences

- The roadmap, OQ-013, REQ-NFR-005, and the ingestion scope say "estimate" for phase 1.
- The `Staging measure` workflow prints the report; its result is recorded in the ingestion scope.
- Phase 2 can start with a complete estimate, without waiting for model calls that do not exist yet.
