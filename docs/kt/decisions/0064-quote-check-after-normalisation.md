---
title: "0064: Quote check after normalisation, and valid candidates are kept"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-AGENT-008, REQ-PROC-009, REQ-AGENT-009, REQ-TEST-006]
---

# 0064: Quote check after normalisation, and valid candidates are kept

- Decision status: Proposed
- Date: 2026-11-07
- Answers: none
- Changes: REQ-AGENT-008 AC2 and REQ-PROC-009 AC3, new REQ-PROC-009 AC7; [contract conventions](../agents/contract-conventions.md), [opportunity extraction](../agents/opportunity-extraction.md), and [golden sets](../test/golden-sets.md)

## Context

Every quote an agent returns must occur in the text it received (REQ-AGENT-008 AC2). Today the check is an exact substring test: `missingQuotes` in `packages/models/src/agent-contract.ts` and the same test in `scripts/check-golden-sets.py`. A model often copies a sentence correctly but changes its typography: a curly apostrophe for a straight one, an en dash for a hyphen, two spaces for one, or the line breaks and ligatures that PDF text extraction leaves in full text. Each of these fails the exact test.

A failed quote rejects the whole output, `callModel` retries with the error, and after `model.max_attempts` the step fails. For extraction that loses every candidate of the publication, also the ones whose quotes were correct. The 2026-11-07 review of the agent chain found this the most likely cause of avoidable extraction failures once full text is used, and each failure costs up to three calls.

## Options considered

1. **Normalise both sides with a fixed list of rules, store the exact source span, and drop only the failing candidate.** Chosen.
2. **Fuzzy matching** (edit distance or token overlap). Rejected: it lets paraphrases and altered numbers pass, and the quote would no longer prove what the source says.
3. **Keep the exact test.** Rejected for the reasons above.

## Decision

- **Normalisation.** One shared function, `normalizeForQuote`, is applied to the quote and to the text before the substring test:
  1. Unicode NFKC, which also splits ligatures such as `ﬁ` into `fi`;
  2. curly single and double quotes, and primes, to the straight `'` and `"`;
  3. hyphen, non-breaking hyphen, figure dash, en dash, em dash, and minus sign to `-`;
  4. soft hyphens (U+00AD) and zero-width characters removed;
  5. every run of whitespace, line breaks included, to one space, and the ends trimmed.
- **Not normalised:** letter case, ellipses (`...` and `…` stay different, because an ellipsis can hide left-out words), and words split by a line-break hyphen. These would let a quote pass that differs from the source in more than typography.
- **Stored quote.** After a match, the pipeline stores the exact span of the source text that matched, not the model's version. Stored quotes stay verbatim, and the dashboard shows the source's own characters.
- **Candidates are dropped, not the whole output.** This applies to extraction, whose output is a list of independent candidates:
  - Attempts before the last fail as before, and the retry names the failing candidate and field.
  - On the last attempt, a candidate that fails a candidate-level check (a quote not found, or a generic customer under [0066](0066-code-checks-before-model-judgement.md)) is dropped. The other candidates are kept.
  - Each dropped candidate is recorded in a new envelope field `Dropped: list<{Index, Field, Reason}>`.
  - When no candidate remains, the result is an empty list, and the pipeline sets `Notes` to say that every candidate failed its checks.
  - Output-level failures (schema, a missing `Notes` on an empty list) still fail the step.
- **Golden sets.** `scripts/check-golden-sets.py` and the eval runner use the same normalisation, so a golden quote and a model quote are judged the same way. The scripts change in the work package that changes `missingQuotes`.

## Consequences

- An output that only differs from the source in typography passes on the first attempt, so fewer calls are spent on retries.
- A publication with one bad candidate keeps its good ones instead of failing.
- The quote check still proves that the quoted words occur in the source in that order.
- The eval report shows how many quotes matched only after normalisation and how many candidates were dropped ([0067](0067-eval-metrics-and-calibration.md)), so a model that drifts toward paraphrase is visible.
- `callModel` (WP2) changes in one place: when the last attempt is schema-valid but fails only its quote check, it also returns that output with the failing fields, so the extraction step can drop candidates. Steps whose output is not a list of independent items keep failing as before.
