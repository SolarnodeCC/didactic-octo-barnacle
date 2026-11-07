---
title: Opportunity extraction
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-PROC-004, REQ-PROC-009]
---

# Opportunity extraction

Requirement: REQ-PROC-004 and REQ-PROC-009. A model-backed step that turns one triaged publication into zero or more candidate opportunities before the analysis agents run (ADR 0036). It follows the [contract conventions](contract-conventions.md). How it sits in the pipeline is in [orchestration](../architecture/orchestration.md).

## Responsible for

- finding candidate software opportunities in one publication
- stating each finding in one sentence, with the customer who has the problem, and quoting both from the text
- returning no candidates when the publication has no quotable problem and customer

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
Finding: string(max 280)                    # the problem in one sentence; evidence required
EvidenceQuote: string(max 500)              # verbatim from the publication text
Customer: string(max 120)                   # the role or organization type that has the problem
CustomerQuote: string(max 500)              # verbatim; names the customer
WhyNow: string(max 200)?                    # the trigger, when the text names one
WhyNowQuote: string(max 500)?               # verbatim; required when WhyNow is set
CurrentAlternative: string(max 200)?        # what the customer does today, when the text names it
AlternativeQuote: string(max 500)?          # verbatim; required when CurrentAlternative is set
```

The pipeline assigns each candidate an Id and links it to the publication before the agents run. Extraction does not invent Ids.

## Rules

- Every quote must occur in the publication text the step received. The pipeline rejects the output when one does not.
- A candidate needs both a quotable problem and a quotable customer. The model leaves out a candidate for which it cannot quote both.
- `Customer` is a role or organization type. A generic or implied party ("users", "people") does not count.
- A burden that belongs to a population or a sector as a whole, with no named customer that could adopt a product against it, yields no candidate (ADR 0050). A named party that can act, such as a hospital or a bank's risk team, still yields one when both quotes exist.
- `WhyNow` and `CurrentAlternative` stay empty when the text does not name them. They are never inferred. Later agents may supply them with search evidence (ADR 0013).
- An empty `Candidates` list is a valid result. `Notes` must say why none were found, for example: no quotable problem, no named customer, no party that can act on the burden, or out of industry scope. It can follow an accepted triage decision, because triage reads signals and extraction reads quotes.
- One finding becomes one candidate. Several distinct problems in one publication yield several candidates, up to the configured maximum.
- Extraction does not score, size markets, name competitors, or invent a product concept. Those belong to later agents.

## Prompt

`extraction@1` in `packages/prompts/src/extraction.ts` carries the rules above and the configured maximum. It sends the full text, cut at `extraction.full_text_max_chars`, when the document has extracted text, and the abstract otherwise. The quote check runs on exactly the text inside the `<publication>` delimiters; a delimiter tag inside the publication is defused first (REQ-NFR-006).

## Evals

Golden set entries include publications that must yield specific candidates, publications that pass triage and must yield no candidate (see [no-opportunity example](../examples/no-opportunity.yaml)), and checks that every quote is present in the fixture text and that every candidate names a customer.
