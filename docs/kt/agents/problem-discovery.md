---
title: Problem Discovery Agent
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-12
related: [REQ-AGENT-002]
---

# Problem Discovery Agent

Requirement: REQ-AGENT-002. Its pain level feeds the Market Potential category (see [scoring](../scoring.md)).

## Responsible for

- identifying the pain point that the research finding can address
- naming who has that pain

Business and industry fit is decided by the [Relevance Agent](relevance.md), not here.

## Inputs

- The candidate opportunity from extraction (REQ-PROC-004), with its evidence quote.
- Publication title, abstract, and full text when available.
- The Research Analyst output.

## Output contract

```yaml
Problem: string(max 280)                    # evidence required
Customer:
  Segment: string(max 120)                  # for example "mid-size hospitals"
  Role: string(max 80)                      # the person who feels the pain
  Industry: Industry
PainLevel: integer 1..5
PainRationale: string(max 400)
Confidence: number 0..1
Notes: string(max 400)?
```

## Rules

| PainLevel | Meaning |
|---|---|
| 1 | Minor inconvenience; people rarely look for a solution. |
| 2 | Recurring annoyance with cheap workarounds. |
| 3 | Measurable loss of time or money; workarounds are costly. |
| 4 | Significant cost, risk, or missed revenue; budget exists to solve it. |
| 5 | Critical: safety, compliance, or business continuity is at stake. |

- The problem is stated from the customer's point of view, not as a research question.
- `Customer` refines the extraction `Customer` (segment, role, industry) and never names a different party (ADR 0070).
- One output describes one problem. A finding with several problems yields several candidates in extraction.

## Prompt

`problem-discovery@1` in `packages/prompts/src/problem-discovery.ts` carries the rules above and the eight industries with their focus areas. It sends the title and abstract without LaTeX markup, the candidate with its quotes, `WhyNow` and `CurrentAlternative` when set, and the Research Analyst output, inside the `<publication>` delimiters ([ADR 0093](../decisions/0093-analysis-agents-benchmark.md)).

## Evals

Golden set entries hold the required facts of the problem, the expected customer industry, and an acceptable PainLevel range. A model judge decides whether each required fact is present, following the rubric `agents/analysis/evals/problem-discovery.rubric.md` (ADR 0093): a fact counts only when the output states it as the customer's pain, never as its cause. Until the judge agrees with the owner on at least 90 % of the facts, its verdicts are reported only and an entry passes on the customer industry and the PainLevel range ([ADR 0095](../decisions/0095-fact-judge-not-calibrated.md)).
