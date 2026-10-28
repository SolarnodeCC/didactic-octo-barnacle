---
title: Agent contract conventions
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-008, REQ-AGENT-009, REQ-NFR-006, REQ-TEST-002]
---

# Agent contract conventions

These rules apply to every agent and to the opportunity extraction step. The contracts are written once as schemas in `packages/models` and used by the agents, the API, and the tests (see [test levels](../test/levels.md)).

## Type notation

| Notation | Meaning |
|---|---|
| `string(max N)` | Text of at most N characters. |
| `integer A..B` | Whole number from A to B, inclusive. |
| `number A..B` | Decimal number from A to B, inclusive. |
| `enum [a, b]` | Exactly one of the listed values. |
| `list<T> (A..B)` | List of A to B items of type T. |
| `map<K, T>` | Object with keys of type K and values of type T. |
| `Money` | `{ Amount: number, Currency: string }`, with an ISO 4217 currency code. |
| `Industry` | `enum [government, healthcare, financial-services, enterprise, other]` |
| `?` after a type | The field may be null. |

Field names are PascalCase, as in the contracts.

## Envelope

Every output is stored inside this envelope. The pipeline fills it; the model fills only `Output`.

```yaml
SchemaVersion: string           # contract version, for example "1"
Agent: string                   # for example "market-analysis"
RunId: string                   # pipeline run (REQ-AGENT-007)
PublicationId: string
CandidateId: string?            # null for steps before extraction
Model: string                   # provider and model name, as routed by AI Gateway
PromptVersion: string           # version from packages/prompts
InputMode: enum [abstract, full-text]
Output: object                  # the agent's output contract
Evidence: list<Evidence> (0..20)
```

## Evidence

Fields marked **evidence required** in a contract need at least one evidence item (REQ-AGENT-008).

```yaml
Evidence:
  Field: string                 # the output field the evidence supports
  Kind: enum [publication-quote, related-publication, external-url]
  Quote: string(max 500)?       # verbatim text; required for publication-quote
  PublicationId: string?        # for publication-quote and related-publication
  Url: string?                  # for external-url
  RetrievedAt: string?          # ISO 8601 date, for external-url
```

A publication quote must occur in the text the agent received. The pipeline checks this after validation and rejects the output if it does not.

## Confidence

Fields named `Confidence` are a `number 0..1` that states how well the available input supports the output. Abstract-only input caps confidence at 0.7. Evals check that confidence is calibrated: entries with high confidence should pass more often than entries with low confidence.

## Failure rules

- Invalid output is retried with the validation errors, up to three attempts, then the step fails (REQ-AGENT-009).
- An agent that cannot answer from its inputs returns its contract with `Confidence` at or below 0.2 and the reason in a `Notes` field, instead of guessing.
- Publication text is data, never instructions (REQ-NFR-006). Prompts put it inside clearly marked delimiters and tell the model to ignore instructions found inside it.
