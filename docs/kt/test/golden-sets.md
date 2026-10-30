---
title: Golden sets and reviewers
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-TEST-004, REQ-TEST-005, REQ-SCORE-006, REQ-AGENT-001]
---

# Golden sets and reviewers

Plan that satisfies REQ-TEST-005 and closes the structure of OQ-015. Named people must be filled before phase 3 starts (roadmap Definition of Ready).

## Reviewer slots (OQ-015)

| Slot | Industry / scope | Name | Confirmed |
|---|---|---|---|
| R1 | Government | _named before phase 3_ | no |
| R2 | Healthcare | _named before phase 3_ | no |
| R3 | Financial services | _named before phase 3_ | no |
| R4 | Enterprise | _named before phase 3_ | no |
| R5 | Shared sample (agreement) | _named before phase 3_ | no |
| R6 | Shared sample (agreement) | _named before phase 3_ | no |

Each industry slot owns that industry's golden-set labels. R5 and R6 both label a shared sample of at least 20 opportunities so inter-rater agreement can be measured.

## Golden set sizes

| Step | Minimum items | Threshold storage |
|---|---|---|
| Triage | 20 publications | `agents/extraction/evals/triage.threshold.json` |
| Opportunity extraction | 20 publications | `agents/extraction/evals/extraction.threshold.json` |
| Each phase-3 agent | 20 candidates | `agents/<area>/evals/<agent>.threshold.json` |
| Calibration (phase 4) | 60 scored opportunities | `packages/scoring/evals/calibration/` |

Threshold files hold `{ "metric": "...", "minimum": number, "tolerance": number }` and are written before the first eval run for that step (REQ-TEST-005). Until written, the agent's REQ-AGENT-* "meets its eval threshold" AC is not runnable.

## Item format

Each golden-set item is YAML next to the agent:

```yaml
id: gs-triage-001
publicationFixture: fixtures/openalex/work-001.json
expected:
  accepted: true
  reasonContains: "software"
notes: "Reviewer R4, 2026-.."
```

Evidence envelopes are required on agent expected outputs (unlike the short product examples). Injection fixtures live under `fixtures/injection/` (REQ-NFR-006).

## Closing OQ-015

OQ-015 is closed when every slot has a real name and confirmation date in this table, updated in the same pull request that removes the OQ row.
