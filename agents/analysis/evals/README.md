# Golden sets for the analysis agents

Items follow the format in `docs/kt/test/golden-sets.md`. Thresholds sit next to this file (`research-analyst.threshold.json`, `problem-discovery.threshold.json`, and the other agent thresholds).

```text
research-analyst/gs-research-analyst-NNN.yaml    expected Novelty range, Maturity, required industries, and the frozen output handed to later agents
problem-discovery/gs-problem-discovery-NNN.yaml  required facts of the problem, customer industry, and PainLevel range
fixtures/neighbors/<arXiv id>.json               the nearest publications that stand in for semantic search (REQ-PROC-003)
```

Publications are read from `agents/extraction/evals/fixtures/arxiv/`. Candidates are read from the expected candidates of the extraction golden set, through `candidateRef`.

## State after the pilot round

| Agent | Entries | Minimum (REQ-TEST-005) |
|---|---|---|
| Research Analyst | 20 | 20 |
| Problem Discovery | 20 | 20 |

- The 20 candidates are the 19 publications of the extraction set that yield a candidate, plus a second candidate of `2610.40071` (`gs-extraction-003`, index 1). The two entries of that publication share its fixtures.
- Industries covered by the candidates: healthcare, financial services, government, and enterprise.
- The other four agents (Relevance, Market Analysis, Competition, Startup Generator) have no entries yet. Relevance builds on the frozen `handoff` blocks of these entries.

## How the neighbor fixtures were made

The platform's corpus does not exist yet, so the ten nearest publications were taken from arXiv. For each candidate publication, Claude ran three topic queries, kept the results published before the candidate publication, and ranked them by word overlap with its title and abstract. Fewer than ten are kept where fewer than ten were close enough (down to two), because few comparable publications is a valid input for the novelty judgement. The fixtures are frozen: a run never queries arXiv. Citation counts and topics are not part of the fixtures.

## How the labels were made

Remco Oostelaar reviewed the pilot round on 2026-11-02. Claude drafted the ranges and the required facts and is not a candidate model in the benchmark. Ranges are the allowed margin: a model output inside the range passes. A Novelty range is at most 30 points wide and a PainLevel range at most 2 wide. `handoff` holds the Novelty at the middle of the range plus the Maturity, industries, and technologies of the expected entry.
