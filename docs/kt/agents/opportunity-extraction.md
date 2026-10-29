---
title: Opportunity extraction
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-PROC-004]
---

# Opportunity extraction

Requirement: REQ-PROC-004. A model-backed step that turns one triaged publication into zero or more candidate opportunities before the analysis agents run. It follows the [contract conventions](contract-conventions.md). How it sits in the pipeline is in [orchestration](../architecture/orchestration.md).

## Responsible for

- finding candidate software opportunities in one publication
- stating each finding in one sentence with an evidence quote
- returning no candidates when the publication has no actionable opportunity

## Inputs

- The triaged publication: title, abstract, and full text when available (`InputMode`).
- The configured maximum number of candidates per publication.
- The target industries from the [overview](../overview.md) (later: an organization profile, REQ-DASH-005).

## Output contract

```yaml
Candidates: list<Candidate> (0..N)          # N is the configured maximum
Confidence: number 0..1
Notes: string(max 400)?                     # required when Candidates is empty
```

`Candidate` is:

```yaml
Finding: string(max 280)                    # evidence required
EvidenceQuote: string(max 500)              # verbatim from the publication text
```

The pipeline assigns each candidate an Id and links it to the publication before the agents run. Extraction does not invent Ids.

## Rules

- Every `EvidenceQuote` must occur in the publication text the step received. The pipeline rejects the output when it does not.
- An empty `Candidates` list is a valid result. `Notes` must say why none were found (for example: theory-only result, no user problem, out of industry scope).
- One finding becomes one candidate. Several distinct problems in one publication yield several candidates, up to the configured maximum.
- Extraction does not score, size markets, name competitors, or invent a product concept. Those belong to later agents.

## Evals

Golden set entries include publications that must yield specific findings, publications that must yield no candidate (see [no-opportunity example](../examples/no-opportunity.yaml)), and checks that every evidence quote is present in the fixture text.
