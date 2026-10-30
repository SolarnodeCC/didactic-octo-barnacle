---
title: "0023: Calibrate the daily model budget from measured cost"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-005]
---

# 0023: Calibrate the daily model budget from measured cost

- Decision status: Accepted
- Date: 2026-10-29

## Context

OQ-021 asked for the production daily model budget. A fixed number cannot be set before phase 3 measures cost per complete opportunity. Teams still need a binding formula before scoring goes live.

## Options considered

1. **Hard-code EUR amount now.** Guesswork; fights the cost success target.
2. **Formula from measured cost**, locked before phase 4 scoring goes live, reviewed monthly.

## Decision

Option 2.

```text
daily_budget_eur = expected_daily_complete_opportunities
                 × measured_cost_per_complete_opportunity_eur
                 × 1.25
```

- `measured_cost_per_complete_opportunity_eur` comes from the phase 3 golden set (REQ-NFR-005).
- `expected_daily_complete_opportunities` is taken from phase 1–3 volume after triage and extraction yields.
- Until that measurement exists, the working ceiling remains EUR 2 per complete opportunity (overview success measures).
- The locked number is written into environment configuration and the launch checklist before phase 4 scoring is enabled. Review monthly; a change is a reviewed pull request.

## Consequences

- OQ-021 is closed as a formula; the numeric lock is a phase-4 launch checklist item, not an open product question.
- Phase 2 still uses the provisional budget of answered OQ-013 (daily limit × cost per publication × 1.5).
