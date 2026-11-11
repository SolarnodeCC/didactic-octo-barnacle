---
title: "0090: Extraction prompt four and benchmark round three"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-006, REQ-PROC-009, REQ-TEST-006]
---

# 0090: Extraction prompt four and benchmark round three

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the prompt `extraction@4` and the rules of [opportunity extraction](../agents/opportunity-extraction.md); the plan of round three of the [model benchmark plan](../test/model-benchmark-plan.md). No requirement changes.

## Context

In round two no extraction model qualified: DeepSeek passed 87.2 / 76.9 / 82.1 % ([ADR 0088](0088-benchmark-round-two-selects-the-triage-model.md)). Apart from the LaTeX markup of [ADR 0089](0089-extraction-reads-text-without-latex-markup.md), its failures fell into three groups, each where the prompt and the labels disagree:

- **Industry scope.** The prompt listed the target industries and named "out of industry scope" as a reason for no candidate. DeepSeek dropped `gs-extraction-017` (healthcare providers) and `039` for that reason, but 11 of the 39 labels are industry `other` and expect a candidate. Industry fit is the job of the Relevance agent (REQ-AGENT-006).
- **Qualified organization types.** DeepSeek called "organizations that run enterprise modernization programs" (`021`, all three runs), "the organization that runs agentic coders" (`003`, two runs), and "Python developers" (`039`, one run) generic. The labels count them as customers, and `extraction.generic_customer_terms` (ADR 0066) does not list them.
- **The labels without a candidate.** On `006`, `015`, and `020` DeepSeek named a system ("Financial assistants") or a whole sector ("Banks / financial institutions") as the customer. The owner kept those labels after a blind cross-check (ADR 0088); their reasons were not in the prompt.

## Decision

`extraction@4` keeps the text of `extraction@3` and changes it in four ways, each chosen by the owner:

1. The title and abstract are sent without LaTeX markup (ADR 0089).
2. Extraction finds candidates in any industry. The list of target industries and "out of industry scope" leave the prompt; the prompt says industry fit is judged later.
3. An organization type or role qualified by what it does, runs, or works with counts as a customer; a bare "organizations", "companies", or "developers" does not.
4. Two reasons of the labels without a candidate are stated: a system, tool, or model is never the customer; and a study that only describes how something fails, or models a risk for observers such as supervisors, yields no candidate unless the text names a party that carries the problem and could act on it. These restate ADR 0050 and its labels; the rule itself does not change.

The examples in the prompt ("ferry operators that plan crew rosters", "museums that digitize their collections") occur in no golden-set entry or fixture, so the prompt carries no label of the set it is scored on.

Round three:

- One candidate: `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, the best of round two.
- Setup as round two: three runs per item, a run passes at 0.80 and every run must pass, a budget of EUR 5, gateway `roi-staging`, a checkpoint per run, no R2, price table `2026-11-11`. The score is the deterministic checks only (schema, verbatim quotes, candidate count); the model judge for `Finding` and `Customer` (OQ-020) stays out, so the rounds compare.
- It runs from `main` after this change merges, with `--step extraction --models @cf/deepseek-ai/deepseek-v4.1-flash-1017 --budget-eur 5` ([running a round](../test/model-benchmark-run.md)).

## Consequences

- The changes come from reading DeepSeek's failures on the 39 entries it is scored on again, so round three may flatter it. The owner chose to record the risk instead of labelling a held-out set first. If DeepSeek qualifies, its quality is checked again on live output by the daily judge sample of [ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md) once phase 2 runs.
- The labels do not change, apart from the markup in one quote (ADR 0089).
- Round three costs about EUR 0.21 at round two's token counts.
