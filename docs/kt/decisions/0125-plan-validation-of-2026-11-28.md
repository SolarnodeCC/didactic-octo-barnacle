---
title: "0125: Plan and requirements validation of 2026-11-28"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-28
related: [REQ-REV-009, REQ-REV-010, REQ-REV-011, REQ-PROC-010, REQ-AGENT-009, REQ-TEST-002, REQ-TEST-005, REQ-DATA-005, REQ-DATA-010, REQ-NFR-004, REQ-NFR-008, REQ-NFR-019, REQ-NFR-021, REQ-AGENT-016]
---

# 0125: Plan and requirements validation of 2026-11-28

- Decision status: Accepted
- Date: 2026-11-28
- Builds on: [ADR 0052](0052-phase-1-requirement-status-sweep.md)
- Changes: the phase of REQ-REV-009 to REQ-REV-011, the dependencies of REQ-PROC-010, the status of REQ-DATA-005, the roadmap lists, and `scripts/check-kt.py`

## Context

The phase 2 build is complete in code, and its exit now waits on staging days and eval runs ([exit evidence](../phase-2/exit-evidence.md)). On 28 November 2026 the roadmap, the phase 2 delivery plan, and the requirement files were checked against the code and the staging database. Every CI check passed, but the documents had drifted where no check looks:

- REQ-REV-011 (phase 2) depended on REQ-TEST-005 (phase 3), and REQ-PROC-010 (phase 2) depended on REQ-AGENT-009 (phase 3). The [requirements rules](../requirements/README.md#rules) forbid a dependency on a later phase.
- The roadmap's requirements per phase did not list REQ-NFR-021 (phase 1) or REQ-AGENT-016 (phase 3), although the roadmap says the lists must match the `Phase` field.
- REQ-REV-009 to REQ-REV-011 (`could`, `planned`) were phase 2 requirements, but were in neither the build plan nor the exit evidence. Because the phase 2 exit sets every phase 2 requirement to `done`, they would have held the exit back.
- `requirements/review.md` was still `draft` while phase 2 was under way, and the Definition of Ready asks for approved requirement files.
- ADR 0052 left REQ-DATA-005 open until the triage step existed. The triage step now rejects an incomplete publication before any model call, so it never reaches extraction or the agents.

## Options considered

For REQ-REV-009 to REQ-REV-011:

1. **Move them to phase 3.** The phase 2 exit keeps its scope. Golden-set drafts (REQ-REV-011) belong next to the analysis-agent golden sets of REQ-TEST-005. Chosen by the owner.
2. **Keep them in phase 2** and add a work package before the exit.
3. **Move them to `later`.**

## Decision

- REQ-REV-009, REQ-REV-010, and REQ-REV-011 move to phase 3, unchanged otherwise. This also removes REQ-REV-011's dependency on a later phase. They are WP8 of the draft [phase 3 build plan](../phase-3/build-plan.md).
- REQ-PROC-010 depends on REQ-TEST-002 instead of REQ-AGENT-009. What the phase 2 recovery needs is the retry with validation errors of the model-call helper, and REQ-TEST-002 verifies that in phase 2 (WP2 of the [phase 2 build plan](../phase-2/build-plan.md)). REQ-AGENT-009 still applies to the agents in phase 3.
- The roadmap lists REQ-NFR-021 in phase 1 and REQ-AGENT-016 in phase 3.
- `requirements/review.md` is `approved` by the code-owner review of the pull request that carries this ADR.
- REQ-DATA-005 is `done`. AC2 is verified by the triage integration test that rejects incomplete publications with no model call. The test name cites REQ-DATA-005 AC2.
- The other phase 1 requirements that ADR 0052 left open stay `in-progress`:

| Requirement | Open criterion | Closes with |
|---|---|---|
| REQ-NFR-008 | AC1: an opportunity ID in the log lines of the candidate pipeline (`apps/pipeline/src/candidate` writes no log lines yet). AC2 is met by the processing run report | the real candidate pipeline (phase 3, REQ-AGENT-007) |
| REQ-NFR-019 | AC1: the availability-breach alert. The budget-stop alert is built | the availability target (REQ-NFR-017, phase 4) |
| REQ-DATA-010 | AC3: the dashboard links to the source instead of serving the PDF | the dashboard (phase 4) |
| REQ-NFR-021 | Hardening grows with each security review. The open criteria are the repository settings that [operations](../operations.md) reviews each quarter | the quarterly review |

- `scripts/check-kt.py` now fails when a requirement depends on a requirement in a later phase, and when the roadmap's requirements per phase differ from the `Phase` fields (REQ-NFR-004).

## Consequences

- Phase 2 has 30 requirements. Its exit no longer waits on optional review-tool features.
- The roadmap and the requirement files cannot drift apart again without a failing `parse` check.
- Phase 3 starts from a draft delivery plan ([phase 3](../phase-3/README.md)), which needs the owner's approval before phase 3 starts.
