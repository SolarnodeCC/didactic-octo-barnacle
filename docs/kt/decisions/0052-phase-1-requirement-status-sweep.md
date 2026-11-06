---
title: "0052: Phase 1 requirement status sweep and the dashboard split of REQ-NFR-002"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-NFR-001, REQ-NFR-002, REQ-NFR-022, REQ-TEST-001]
---

# 0052: Phase 1 requirement status sweep and the dashboard split of REQ-NFR-002

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the `Status` of eleven phase 1 requirements; REQ-NFR-002 AC1; new REQ-NFR-022

## Context

On 6 November 2026, 13 of the 18 phase 1 requirements were `in-progress` or `planned`, although most had tests that name them (REQ-TEST-001). REQ-NFR-002 AC1 also required the dashboard to run on Workers through OpenNext, which is phase 4 work, so the phase 1 requirement could not close in phase 1.

## Options considered

For REQ-NFR-002:

1. **Split it.** REQ-NFR-002 keeps what runs now; a new phase 4 requirement takes the dashboard. Chosen by the owner.
2. **Keep it open** until phase 4.
3. **Move it to phase 4** as a whole.

## Decision

- Each acceptance criterion of the phase 1 requirements was checked against the tests that name it, or against a named review. A requirement is `done` only when every criterion is covered.
- `done`: REQ-DATA-001, REQ-DATA-002, REQ-DATA-007, REQ-DATA-011, REQ-NFR-001, REQ-NFR-002, REQ-NFR-009, REQ-NFR-016, REQ-NFR-020, REQ-TEST-001, REQ-TEST-003. REQ-DATA-004, REQ-DATA-009, and REQ-NFR-004 were already `done`.
- REQ-NFR-001 AC3 is verified by the owner's confirmation of 2026-11-06 that GitHub secret scanning with push protection is enabled ([named reviews](../test/named-reviews.md)).
- REQ-NFR-002 AC1 no longer names the dashboard. New REQ-NFR-022 (phase 4) holds it.
- These stay `in-progress`, because one criterion needs a later phase:

| Requirement | Open criterion | Closes with |
|---|---|---|
| REQ-DATA-005 | AC2: an incomplete publication is not passed to the agents | the triage step (phase 2) |
| REQ-DATA-010 | AC3: the dashboard links to the source instead of serving the PDF | the dashboard (phase 4) |
| REQ-NFR-008 | AC1 and AC2: opportunity IDs in logs and a report for each pipeline run | the pipeline run (phase 2) |
| REQ-NFR-019 | AC1: alerts for a budget stop and an availability breach | the cost budget (phase 2) and availability target (REQ-NFR-017, phase 4) |

## Consequences

- The ingestion side of phase 1 is complete in the requirement files. The four open requirements no longer block the phase 1 exit, which follows the [roadmap](../roadmap.md) criterion of ADR 0051.
- REQ-NFR-022 appears in the phase 4 list of the roadmap.
