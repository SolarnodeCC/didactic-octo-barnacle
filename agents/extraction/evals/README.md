# Golden sets for triage and opportunity extraction

Items follow the format in `docs/kt/test/golden-sets.md`. Thresholds are in `triage.threshold.json` and `extraction.threshold.json`.

```text
fixtures/arxiv/<arXiv id>.json    the publication, in the shape of the arXiv fixtures of apps/pipeline
triage/gs-triage-NNN.yaml         the five expected signals and the decision (REQ-PROC-008)
extraction/gs-extraction-NNN.yaml the expected candidates with quotes (REQ-PROC-009)
```

## State after round 2

| Set | Entries | Minimum (REQ-TEST-005) |
|---|---|---|
| Triage | 59 | 20 |
| Extraction | 23 | 20 |

- Both sets reach the minimum, so the eval thresholds of triage and extraction are runnable once the harness exists.
- Triage: 23 accepted and 36 rejected. Three entries from round 1 (`gs-triage-009`, `-010`, `-011`) reach the score cut but are rejected because `namedParty` is false.
- Extraction: 23 entries for the 23 accepted publications. 19 have one candidate and 4 pass triage and yield no candidate (`gs-extraction-006`, `-015`, `-020`, `-022`, each with `candidates: []` and a `reason`).
- Industries with an accepted entry: healthcare (9), financial services (7), government (5), enterprise (3).
- Boundary cases are marked in the notes, for example a method paper that passes the rule and a score exactly on the cut.

## How the labels were made

Remco Oostelaar reviewed rounds 1 and 2 on 2026-11-02. Claude read the five signals under ADR 0036 and drafted the quotes, and the owner confirms them by merging the pull request. Claude is not a candidate model in the benchmark. A fixture holds a title, an abstract, and categories; it holds no author data.
