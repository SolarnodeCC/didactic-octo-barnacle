# Golden sets for triage and opportunity extraction

Items follow the format in `docs/kt/test/golden-sets.md`. Thresholds are in `triage.threshold.json` and `extraction.threshold.json`.

```text
fixtures/arxiv/<arXiv id>.json    the publication, in the shape of the arXiv fixtures of apps/pipeline
triage/gs-triage-NNN.yaml         the five expected signals and the decision (REQ-PROC-008)
extraction/gs-extraction-NNN.yaml the expected candidates with quotes (REQ-PROC-009)
```

## State after round 3

| Set | Entries | Minimum (REQ-TEST-006) |
|---|---|---|
| Triage | 91 | 20 |
| Extraction | 38 | 20 |

- Round 3 (draft, awaiting owner review) adds 32 triage and 15 extraction entries: 6 publications each for automotive, consumer products and retail, energy and utilities, and aerospace and defense, and 4 each for insurance and life sciences, which had too few entries. Of the 32, 15 are accepted and 17 rejected.
- Both sets reach the minimum, so the eval thresholds of triage and extraction are runnable once the harness exists.
- Triage: 38 accepted and 53 rejected. Three entries from round 1 (`gs-triage-009`, `-010`, `-011`) reach the score cut but are rejected because `namedParty` is false.
- Extraction: 38 entries for the 38 accepted publications. 34 have candidates (`gs-extraction-003` has two, added in the agent pilot) and 4 pass triage and yield no candidate (`gs-extraction-006`, `-015`, `-020`, `-022`, each with `candidates: []` and a `reason`).
- Industries: every extraction entry has an `industry` field (the eight values of ADR 0037 or `other`). Entries per value: automotive 2, aerospace-defense 3, consumer-retail 3, energy-utilities 3, banking 6, insurance 2, public-sector 5, life-sciences 3, other 11. Triage entries carry the industry only in the notes of the round 3 entries.
- Boundary cases are marked in the notes, for example a method paper that passes the rule and a score exactly on the cut.

## How the labels were made

Remco Oostelaar reviewed rounds 1 and 2 on 2026-11-02. Claude read the five signals under ADR 0036 and drafted the quotes, and the owner confirms them by merging the pull request. Claude is not a candidate model in the benchmark. A fixture holds a title, an abstract, and categories; it holds no author data.
