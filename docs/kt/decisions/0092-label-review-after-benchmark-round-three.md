---
title: "0092: Label review after benchmark round three"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-PROC-009, REQ-TEST-006]
---

# 0092: Label review after benchmark round three

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the customer quote of `gs-extraction-003`. No requirement or rule changes.

## Context

After round three ([ADR 0091](0091-benchmark-round-three-selects-the-extraction-model.md)) DeepSeek still answered five extraction entries against their labels. The owner reviewed them as [ADR 0072](0072-one-owner-reviews-the-golden-sets-with-agents.md) sets out: `llama-3.3-70b-instruct-fp8-fast`, another model family, read each publication blind under the rules of `extraction@4`, without the label or DeepSeek's answers, and the owner decided each entry.

| Entry | Label | DeepSeek, three runs | Blind cross-check | Owner's decision |
|---|---|---|---|---|
| `gs-extraction-002` | One candidate: national-level regulatory bodies | The regulators plus "digital news outlets" in every run | The regulators only | Keep one candidate: the outlets sentence is context for the regulators' problem (the label's `WhyNow`), not a problem the outlets carry and act on |
| `gs-extraction-003` | One candidate: the organization that runs agentic coders | No candidate in two runs ("organization" read as bare) | A candidate, with a customer quote that is not verbatim | Keep the candidate; widen the customer quote to the whole sentence |
| `gs-extraction-020` | No candidate (ADR 0050) | Banks that depend on shared AI vendors, every run | Supervisors | Keep no candidate: the text frames a risk of the banking system as a whole and gives the tool to supervisors, the case of ADR 0050 |
| `gs-extraction-015` | No candidate (ADR 0050) | Software engineers; health systems and engineers; none | None | Keep |
| `gs-extraction-022` | No candidate | Workers once, developers twice | Workers (the survey participants) | Keep: DeepSeek's answers vary and name the study's subjects or audience |

`015`, `020`, and `022` were reviewed once already that day ([ADR 0088](0088-benchmark-round-two-selects-the-triage-model.md)); the answers on `extraction@4` added no reason to change them.

## Decision

- The customer quote of `gs-extraction-003` becomes "How to ensure the agentic coder is compliant with the policies of the organization", the whole sentence of the abstract. It shows the qualifier that `extraction@4` asks for: the organization runs the agentic coder. The customer and the finding stay.
- The other four labels stay as they are.

## Consequences

- The extraction eval scores the model's quotes, not the label's, so the round-three result of ADR 0091 does not change.
- DeepSeek's remaining disagreements on `015`, `020`, `022`, and `002` count as model errors against the labels; the daily judge sample of [ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md) shows whether such answers recur on live output.
