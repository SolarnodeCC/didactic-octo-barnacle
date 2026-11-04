---
title: Golden sets and reviewers
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-03
related: [REQ-TEST-004, REQ-TEST-005, REQ-SCORE-006, REQ-AGENT-001]
---

# Golden sets and reviewers

Plan that satisfies REQ-TEST-005 and closes the structure of OQ-015. Named people must be filled before phase 3 starts (roadmap Definition of Ready).

## Reviewer slots (OQ-015)

| Slot | Industry / scope | Name | Confirmed |
|---|---|---|---|
| R1 | Automotive | _named before phase 3_ | no |
| R2 | Aerospace & Defense | _named before phase 3_ | no |
| R3 | Consumer Products & Retail | _named before phase 3_ | no |
| R4 | Energy & Utilities | _named before phase 3_ | no |
| R5 | Banking (Finance) | _named before phase 3_ | no |
| R6 | Insurance | _named before phase 3_ | no |
| R7 | Public Sector | _named before phase 3_ | no |
| R8 | Life Sciences | _named before phase 3_ | no |
| R9 | Shared sample (agreement) | _named before phase 3_ | no |
| R10 | Shared sample (agreement) | _named before phase 3_ | no |

Each industry slot owns that industry's golden-set labels. R9 and R10 both label a shared sample of at least 20 opportunities so inter-rater agreement can be measured.

## Golden set sizes

| Step | Minimum items | Threshold storage |
|---|---|---|
| Triage | 20 publications | `agents/extraction/evals/triage.threshold.json` |
| Opportunity extraction | 20 publications | `agents/extraction/evals/extraction.threshold.json` |
| Each phase-3 agent | 20 candidates | `agents/<area>/evals/<agent>.threshold.json` |
| Calibration (phase 4) | 60 scored opportunities | `packages/scoring/evals/calibration/` |

Threshold files hold `{ "metric": "...", "minimum": number, "tolerance": number }` and are written before the first eval run for that step (REQ-TEST-005). Until written, the agent's REQ-AGENT-* "meets its eval threshold" AC is not runnable.

## Threshold values

The first values are the owner's decision of 2026-11-01 and count as approved when the pull request that adds the files is merged (REQ-TEST-005, criterion 4). They apply to every model tested for a step, so a model change is judged against the same bar (REQ-TEST-004, [model benchmark plan](model-benchmark-plan.md)).

- `metric` is `entry-pass-rate`: the share of golden-set entries on which all checks of [AI evals](ai-evals.md) pass.
- `minimum` is the required share.
- `tolerance` is the allowed shortfall. A run fails when the share is below `minimum` minus `tolerance`. At 20 entries, 0.05 is exactly one entry.

| Tier | Steps | Minimum | Entries to pass at 20 | Why |
|---|---|---|---|---|
| 1 | Triage, opportunity extraction, Relevance | 0.85 | 16 | Mostly mechanical checks: accept or reject, verbatim quotes, enums, and ranges. Evidence errors weigh on the explainability target (at least 95 %, [overview](../overview.md)). |
| 2 | Research Analyst, Problem Discovery, Market Analysis, Competition | 0.75 | 14 | Judgment checked against acceptable ranges and required facts. |
| 3 | Startup Generator | 0.7 | 13 | Free text graded by a model judge with a rubric. |

The tiers follow the kind of check, not measured model quality. They serve the provisional targets of the overview (explainability and precision of High and Exceptional opportunities). After the first eval runs the thresholds are reviewed once with data ([AI evals](ai-evals.md)); until then they are not tuned to first results. Each file has the same `tolerance` of 0.05, so grow a golden set before tightening a threshold in steps smaller than one entry.

## Item format

Each golden-set item is YAML next to the agent:

```yaml
id: gs-triage-001
publicationFixture: fixtures/openalex/work-001.json
expected:
  signals:                      # the five triage signals (REQ-PROC-008)
    namedParty: true
    statedHarm: true
    trigger: false
    existingAlternative: true
    adoptable: true
  accepted: true                # follows from the signals by the triage rule; checked for consistency
  reason: accepted              # accepted, or low-score when the signal rule fails
basis:                          # optional: the words or the reason behind each signal
  namedParty: "governments, growers and scientists"
  statedHarm: "crop loss"
notes: "Reviewer R7, 2026-.."
```

An extraction item lists the expected candidates, or an empty list with the reason (REQ-PROC-009):

```yaml
id: gs-extraction-001
publicationFixture: fixtures/openalex/work-001.json
industry: public-sector       # the customer's industry (ADR 0037), or other
expected:
  candidates:
    - finding: "One sentence that states the problem."
      evidenceQuote: "Verbatim from the abstract."
      customer: "regulatory bodies"
      customerQuote: "Verbatim from the abstract."
notes: "Reviewer R7, 2026-.."
```

`industry` is one of the eight target industries or `other`. It is the industry of the customer in the first candidate (or of the publication, for an entry without a candidate), and it lets a check count the entries per industry (REQ-TEST-005, criterion 1).

An entry for a publication that passes triage but yields no candidate has `candidates: []` and a `reason` string under `expected`:

```yaml
expected:
  candidates: []
  reason: "A population-level burden with no named party that acts on it."
```

## Analysis agent items

Research Analyst and Problem Discovery items point to a candidate of the extraction golden set, so every agent works on the same publications. The nearest publications are frozen fixtures, and a Research Analyst entry freezes the output that the next agents receive:

```yaml
id: gs-research-analyst-001
publicationFixture: ../../extraction/evals/fixtures/arxiv/2610.40641.json
candidateRef: ../../extraction/evals/extraction/gs-extraction-001.yaml#0
neighborsFixture: fixtures/neighbors/2610.40641.json
expected:
  noveltyRange: [40, 70]       # at most 30 points wide
  maturity: prototype
  industriesInclude: [public-sector]
handoff:                       # the input of Problem Discovery and later agents
  novelty: 55
  maturity: prototype
  industry: [public-sector]
  technology: ["agentic AI"]
```

```yaml
id: gs-problem-discovery-001
publicationFixture: ../../extraction/evals/fixtures/arxiv/2610.40641.json
candidateRef: ../../extraction/evals/extraction/gs-extraction-001.yaml#0
researchAnalystRef: research-analyst/gs-research-analyst-001.yaml
expected:
  requiredFacts: ["facts the Problem field must state, judged against a rubric"]
  customerIndustry: public-sector
  painLevelRange: [3, 4]      # at most 2 wide
```

A Relevance item reads the frozen outputs of the two agents before it and lists acceptable ranges, because the strategic relevance score is computed by code from the model's industry fit and focus match:

```yaml
id: gs-relevance-001
publicationFixture: ../../extraction/evals/fixtures/arxiv/2610.40641.json
candidateRef: ../../extraction/evals/extraction/gs-extraction-001.yaml#0
researchAnalystRef: research-analyst/gs-research-analyst-001.yaml
problemDiscoveryRef: problem-discovery/gs-problem-discovery-001.yaml
expected:
  bestIndustry: public-sector
  strategicRelevanceRange: [35, 65]    # at most 30 wide
  technicalFeasibilityRange: [50, 75]  # at most 30 wide
  implementationEffort: L              # S, M, L, or XL
```

Evidence envelopes are required on agent expected outputs (unlike the short product examples). Injection fixtures live under `fixtures/injection/` (REQ-NFR-006).

## Closing OQ-015

OQ-015 is closed when every slot has a real name and confirmation date in this table, updated in the same pull request that removes the OQ row.
