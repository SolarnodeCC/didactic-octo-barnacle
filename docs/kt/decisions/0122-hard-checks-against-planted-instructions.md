---
title: "0122: Hard checks and an adversarial set against planted instructions"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-006, REQ-PROC-009, REQ-AGENT-008, REQ-TEST-006]
---

# 0122: Hard checks and an adversarial set against planted instructions

- Decision status: Accepted
- Date: 2026-11-24
- Changes: REQ-NFR-006 (criteria 4 and 5), [security](../architecture/security.md), [AI evals](../test/ai-evals.md)

## Context

Publication text reaches the model inside delimiters, with the instruction to treat it as data, and the output is validated against the contract (REQ-NFR-006). The security review of 2026-11-23 (issue 179, medium) called these soft controls: a model does not reliably obey delimiters, and the contract tests used one injection fixture. An abstract could tell the model to set every triage signal or to quote attacker text as evidence, and the output would still be schema-valid.

## Options considered

1. **Code checks that do not depend on the model, an injection corpus for every prompt, and an adversarial benchmark set built from the owner's labels.**
2. **A heuristic that rejects any publication with instruction-like text.** Rejected: papers about LLM security quote phrases such as "ignore previous instructions", and those are relevant publications.
3. **A second model that compares answers.** Doubles the model cost of every step; kept as a later option if the adversarial set shows a gap.

## Decision

Option 1.

- `containsPlantedInstruction` in `packages/models` recognises text that no genuine paper contains: a publication delimiter (live or defused by `defuseTags`) or a field name of the output contracts in its exact spelling, such as `NamedParty` or `EvidenceQuote`.
- `extractionItemChecks` drops a candidate whose quote carries a planted instruction, with the reason `instruction-quote` and a retry message that says so. The extraction consumer counts these as `DroppedInstruction`. Together with the verbatim check, a candidate can no longer rest on a fabricated quote or on the attacker's own sentence.
- `INJECTION_PAYLOADS` in `packages/prompts` holds eight payloads: tag break-out, spaced tags, contract field names, a fabricated quote, a JSON answer, plain-language and role-play overrides, and a fenced block. A contract test sends each through every prompt builder and checks that it stays inside one delimited block.
- `withInjections` builds the adversarial set: each triage and extraction golden-set entry with one payload appended to its abstract, in turn, and its labels unchanged, because a planted instruction must not change them. `roi-benchmark --injection` runs triage and extraction on it with the usual thresholds.
- Agents stay without write tools (REQ-NFR-006 AC2).

## Consequences

- A triage decision still rests on the model's reading of the signals. The adversarial set measures how often a planted instruction moves it; a test shows that a model that obeys the payloads fails the triage threshold.
- The adversarial set is run with the next benchmark round; its result is recorded in that round's ADR.
- Score review by an analyst stays the human check on high-scoring output (REQ-SCORE-007).
