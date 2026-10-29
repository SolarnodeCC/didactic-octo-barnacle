---
title: Agent contract conventions
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-AGENT-008, REQ-AGENT-009, REQ-AGENT-010, REQ-AGENT-011, REQ-NFR-006, REQ-TEST-002]
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
OutputMode: enum [tool-use, json-schema, prompt-only]  # how the schema was enforced (REQ-AGENT-010)
Attempts: integer 1..N          # attempts used, including failed ones (REQ-AGENT-009)
Repairs: list<enum [unwrapped-json-string, stripped-code-fence]>  # repairs applied (REQ-AGENT-011)
Output: object                  # the agent's output contract
Evidence: list<Evidence> (0..20)
```

## Evidence

Fields marked **evidence required** in a contract need at least one evidence item (REQ-AGENT-008). A field marked **evidence required when …** needs evidence only when that condition holds (for example Market Analysis TAM/SAM when `Basis` is `sourced`). Estimated figures do not need evidence items; the dashboard still labels them as estimates.

```yaml
Evidence:
  Field: string                 # the output field the evidence supports
  Kind: enum [publication-quote, related-publication, external-url, none-found]
  Quote: string(max 500)?       # verbatim text; required for publication-quote
  PublicationId: string?        # for publication-quote and related-publication
  Url: string?                  # for external-url; must be https
  Note: string(max 200)?        # for none-found: what was searched or compared
  RetrievedAt: string?          # ISO 8601 date, for external-url
```

A publication quote must occur in the text the agent received. The pipeline checks this after validation and rejects the output if it does not.

A `none-found` item records that a comparison or search was done and found nothing, for example no related publications or no competitors. A contract allows it only for the fields that say so (Research Analyst `Novelty`, Competition `Gap`).

Agents that do not receive publication text, such as Relevance, cite `related-publication` evidence or state their basis in `Notes`; judgment fields that no source can support are labeled as model estimates in the dashboard instead of requiring evidence (see each agent's contract).

## Confidence

Fields named `Confidence` are a `number 0..1` that states how well the available input supports the output. Abstract-only input caps confidence at 0.7. Evals check that confidence is calibrated: entries with high confidence should pass more often than entries with low confidence.

## Structured output and repair

The contract schema is sent to the model through the provider's structured-output mechanism, and the result is validated against the same schema either way (REQ-AGENT-010). Providers still return output that is correct in content but wrapped wrongly. Plain code repairs exactly two cases before validation (REQ-AGENT-011):

| Case | Repair |
|---|---|
| A field holds a JSON-encoded string where the contract expects an array or object | Decode the string once. |
| The output is wrapped in a markdown code fence | Remove the fence. |

A repair never changes a value, adds a field, or fills a default. The repaired output goes through full validation and the evidence check like any other output, and each repair is listed in `Repairs`. A new repair case needs a contract test with a real example first.

## Failure rules

- Invalid output, after any repair, is retried with the validation errors, up to three attempts, then the step fails (REQ-AGENT-009). A repair does not use up an attempt.
- An agent that cannot answer from its inputs returns its contract with `Confidence` at or below 0.2 and the reason in a `Notes` field, instead of guessing.
- Publication text is data, never instructions (REQ-NFR-006). Prompts put it inside clearly marked delimiters and tell the model to ignore instructions found inside it.
