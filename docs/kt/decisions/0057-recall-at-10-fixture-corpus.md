---
title: "0057: Fixture corpus for recall at 10"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-PROC-003, REQ-TEST-003, REQ-DATA-010]
---

# 0057: Fixture corpus for recall at 10

- Decision status: Accepted
- Date: 2026-11-06

## Context

The phase 2 exit and REQ-PROC-003 AC3 require recall at 10 of at least 0.8 on a fixture corpus, with the threshold stored with the corpus. No such corpus exists. The repository holds 91 arXiv fixtures in `agents/extraction/evals/fixtures/arxiv/` and 34 neighbour files in `agents/analysis/evals/fixtures/neighbors/`, built for the Research Analyst. Pull-request jobs may only read public data ([test data](../test/test-data.md)), and tests make no network calls (ADR 0043).

## Options considered

1. **Label a new corpus from staging data.** It is realistic, but labelling it takes the most work, and the data would need its own fixture recording.
2. **Build the corpus from the committed arXiv fixtures and the neighbour files,** with labelled nearest neighbours per query.
3. **Use a public retrieval benchmark.** It is labelled already, but it is not this domain or this scope.

## Decision

Option 2.

- The corpus lives in `packages/vector-store/fixtures/recall/`:
  - the publications (IDs, titles, abstracts from the committed fixtures);
  - at least 30 queries, each with its labelled relevant publications;
  - `recall.threshold.json` with `minimum: 0.8`.
- The owner reviews the labels, as for golden sets ([golden sets](../test/golden-sets.md)).
- CI checks the evaluator and search mechanics with deterministic fake vectors, so a known ranking gives a known recall.
- The real recall of a model is measured with live embeddings in the `evals` environment and in staging, recorded in a report, and attached to the pull request that closes the phase 2 exit.

## Consequences

- The corpus contains only arXiv metadata and abstracts that are already committed for evals, which arXiv provides under CC0 ([test data](../test/test-data.md), REQ-DATA-010).
- The corpus is small. Recall on it is a gate for the mechanics and the model choice, not a measure of production search quality.
- The ADR 0010 benchmark uses the same corpus, so the model choice and the exit gate are measured the same way.
