# Golden sets for the analysis agents

Items follow the format in `docs/kt/test/golden-sets.md`. Thresholds sit next to this file (`research-analyst.threshold.json`, `problem-discovery.threshold.json`, and the other agent thresholds).

```text
research-analyst/gs-research-analyst-NNN.yaml    expected Novelty range, Maturity, required industries, and the frozen output handed to later agents
problem-discovery/gs-problem-discovery-NNN.yaml  required facts of the problem, customer industry, and PainLevel range
relevance/gs-relevance-NNN.yaml                  expected best industry, strategic relevance and feasibility ranges, and implementation effort
fixtures/neighbors/<arXiv id>.json               the nearest publications that stand in for semantic search (REQ-PROC-003)
problem-discovery.rubric.md                      the versioned rubric of the fact judge, with its calibration record (ADR 0093)
```

Publications are read from `agents/extraction/evals/fixtures/arxiv/`. Candidates are read from the expected candidates of the extraction golden set, through `candidateRef`.

## State after the label reviews of ADR 0099, ADR 0101, and ADR 0108

| Agent | Entries | Minimum (REQ-TEST-005) |
|---|---|---|
| Research Analyst | 33 | 20 |
| Problem Discovery | 33 | 20 |
| Relevance | 33 | 20 |

- Round 3 left 35 candidates per set: the 34 publications of the extraction set that yield a candidate, plus a second candidate of `2610.40071` (`gs-extraction-003`, index 1). The round-two label review removed two of them with their entries in all three sets: the candidate of `gs-extraction-004`, which yields none after the review (ADR 0084), and the second candidate of `gs-extraction-003` (ADR 0085). Entry numbers are not reused.
- Industries use the eight target industries of ADR 0037 plus `other`. Entries per value:

| Value | Research Analyst (industries that must appear) | Problem Discovery (customer industry) | Relevance (best industry) |
|---|---|---|---|
| `automotive` | 2 | 2 | 2 |
| `aerospace-defense` | 3 | 3 | 4 |
| `consumer-retail` | 3 | 3 | 3 |
| `energy-utilities` | 3 | 3 | 3 |
| `banking` | 4 | 4 | 5 |
| `insurance` | 2 | 2 | 3 |
| `public-sector` | 5 | 5 | 5 |
| `life-sciences` | 2 | 2 | 8 |
| `other` | 9 | 9 | not allowed |

- Every one of the eight industries now has entries in all three sets. Care providers (nurses, emergency departments, psychiatric intake, telephone triage) and cross-industry software stay `other` for Research Analyst and Problem Discovery; Relevance scores them against the closest industry, at most in the indirect band (ADR 0099).
- Relevance reads the frozen `handoff` blocks and the Problem Discovery facts of the same entries. Its ranges are at most 30 points wide. The strategic relevance range follows one band against the best industry's focus areas, read literally: outside [20, 50], indirect [45, 75], within [75, 100] (ADR 0099).
- The other three agents (Market Analysis, Competition, Startup Generator) have no entries yet. Market Analysis and Competition need recorded search results first (REQ-AGENT-013).

## How the neighbor fixtures were made

The platform's corpus does not exist yet, so the ten nearest publications were taken from arXiv. For each candidate publication, Claude ran three topic queries, kept the results published before the candidate publication, and ranked them by word overlap with its title and abstract. Fewer than ten are kept where fewer than ten were close enough (down to two), because few comparable publications is a valid input for the novelty judgement. The fixtures are frozen: a run never queries arXiv. Citation counts and topics are not part of the fixtures.

## How the labels were made

Remco Oostelaar reviewed the pilot round and the Relevance round on 2026-11-02; round 3 is drafted for his review in the pull request. Claude drafted the ranges and the required facts and is not a candidate model in the benchmark. Ranges are the allowed margin: a model output inside the range passes. A Novelty range is at most 30 points wide and a PainLevel range at most 2 wide. `handoff` holds the Novelty at the middle of the range plus the Maturity, industries, and technologies of the expected entry.

The label review of 2026-11-13 ([ADR 0099](../../../docs/kt/decisions/0099-research-analyst-and-relevance-label-review.md)) changed 16 Research Analyst and 29 Relevance entries: Claude drafted, `llama-3.3-70b-instruct-fp8-fast` cross-checked blind, and Remco Oostelaar confirmed each change.
