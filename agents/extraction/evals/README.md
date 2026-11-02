# Golden sets for triage and opportunity extraction

Items follow the format in `docs/kt/test/golden-sets.md`. Thresholds are in `triage.threshold.json` and `extraction.threshold.json`.

```text
fixtures/arxiv/<arXiv id>.json    the publication, in the shape of the arXiv fixtures of apps/pipeline
triage/gs-triage-NNN.yaml         the five expected signals and the decision (REQ-PROC-008)
extraction/gs-extraction-NNN.yaml the expected candidates with quotes (REQ-PROC-009)
```

## State after round 1

| Set | Entries | Minimum (REQ-TEST-005) |
|---|---|---|
| Triage | 14 | 20 |
| Extraction | 3 | 20 |

- The eval threshold of a step is not runnable until its set has 20 entries.
- Triage: 3 accepted and 11 rejected. Three entries (`gs-triage-009`, `-010`, `-011`) reach the score cut with three or more true signals but are rejected because `namedParty` is false.
- Extraction entries exist only for publications that pass triage. There are no entries yet that pass triage and yield no candidate (at least three are needed).
- Industries with an accepted entry: government (2) and enterprise (1). Healthcare and financial services have none yet.

## How the labels were made

Remco Oostelaar reviewed round 1 on 2026-11-02. Claude read the five signals under ADR 0036 and drafted the quotes, and the owner confirms them by merging the pull request. Claude is not a candidate model in the benchmark. A fixture holds a title, an abstract, and categories; it holds no author data.
