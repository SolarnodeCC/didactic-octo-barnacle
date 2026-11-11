---
title: Opportunity extraction
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
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

- Every quote must occur in the publication text the step received, after the normalisation of the [contract conventions](contract-conventions.md). An attempt with a missing quote is retried with the candidate and field named. On the last attempt the failing candidate is dropped and listed in `Dropped`, and the other candidates are kept (ADR 0064).
- A candidate needs both a quotable problem and a quotable customer. The model leaves out a candidate for which it cannot quote both.
- `Customer` is a role or organization type. A generic or implied party ("users", "people") does not count. Code checks this against `extraction.generic_customer_terms` and fails a candidate whose whole `Customer`, after a leading `the`, `all`, `many`, or `most`, is a listed term (ADR 0066).
- An organization type or role qualified by what it does, runs, or works with counts as a customer; a bare "organizations", "companies", or "developers" does not. A system, tool, or model is never the customer: the customer is the party that runs or uses it and carries the problem ([ADR 0090](../decisions/0090-extraction-prompt-four-and-benchmark-round-three.md)).
- A burden that belongs to a population or a sector as a whole, with no named customer that could adopt a product against it, yields no candidate (ADR 0050). A named party that can act, such as a hospital or a bank's risk team, still yields one when both quotes exist. A study that only describes how something fails, or models a risk for observers such as supervisors, yields no candidate unless the text names a party that carries the problem and could act on it.
- Extraction does not filter by industry. It finds candidates in any industry, and the Relevance agent judges industry fit (REQ-AGENT-006, ADR 0090).
- `WhyNow` and `CurrentAlternative` stay empty when the text does not name them. They are never inferred. Every later agent receives them with their quotes when they are set, and Competition may find further alternatives with the search tool (ADR 0013, ADR 0070).
- An empty `Candidates` list is a valid result. `Notes` must say why none were found, for example: no quotable problem, no named customer, or no party that can act on the burden. It can follow an accepted triage decision, because triage reads signals and extraction reads quotes.
- A publication yields one primary candidate: the strongest problem with the customer who has it. A further candidate is added only when the text names a separate customer with a separate problem, each with its own quotes, up to the configured maximum. Variants of one problem, further consequences of it, and further problems of the same customer stay in the one candidate ([ADR 0085](../decisions/0085-one-primary-extraction-candidate.md)).
- Extraction does not score, size markets, name competitors, or invent a product concept. Those belong to later agents.

## Prompt

`extraction@4` in `packages/prompts/src/extraction.ts` carries the rules above and the configured maximum ([ADR 0090](../decisions/0090-extraction-prompt-four-and-benchmark-round-three.md); the rule of one primary candidate of [ADR 0085](../decisions/0085-one-primary-extraction-candidate.md) and the output budget of 8192 tokens of [ADR 0076](../decisions/0076-stream-benchmark-calls-and-larger-output-budget.md) stay). It sends the full text, cut at `extraction.full_text_max_chars`, when the document has extracted text, and the abstract otherwise. The title and abstract are sent without LaTeX markup ([ADR 0089](../decisions/0089-extraction-reads-text-without-latex-markup.md)). The model is `deepseek-v4.1-flash-1017` (`model.extraction`, [ADR 0091](../decisions/0091-benchmark-round-three-selects-the-extraction-model.md)). The quote check runs on exactly the text inside the `<publication>` delimiters; a delimiter tag inside the publication is defused first (REQ-NFR-006).

## Evals

Golden set entries include publications that must yield specific candidates, publications that pass triage and must yield no candidate (see [no-opportunity example](../examples/no-opportunity.yaml)), and checks that every quote is present in the fixture text and that every candidate names a customer.
