---
title: AI evals
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-TEST-004, REQ-TEST-005, REQ-NFR-003, REQ-AGENT-008, REQ-SCORE-006]
---

# AI evals

Agent output comes from language models and varies between runs. Exact assertions do not work, so quality is measured with evals.

## Golden sets

- One golden set per agent, for triage, and for opportunity extraction, of at least 20 entries each (REQ-TEST-005), stored under `evals/` in the agent's directory.
- Each entry holds the input (paper metadata, abstract, and an extract when the license allows it), the outputs of earlier agents it depends on, and a reviewed expected outcome: required facts, acceptable ranges for numeric fields, and outcomes that must not occur.
- Cover all eight target industries (at least one entry per industry) and include at least three papers that should yield no opportunity.
- Each entry names its reviewer. The reviewer is the owner, who confirms every entry. Agents draft and cross-check labels and never confirm one: a second agent from another model family labels the same entries blind, and the owner decides the entries on which they disagree (ADR 0072).
- The agreement of the owner with that second agent on a shared sample of at least 20 entries is recorded, and the owner re-labels at least 10 entries after at least three days. Entries on which they disagree are decided before they enter the set.
- Changes to a golden set need review by a code owner of `docs/kt`.

## How output is scored

| Check | Applies to | Pass rule |
|---|---|---|
| Schema | every output | must pass, always |
| Evidence | fields marked evidence required | every quote occurs in the input (REQ-AGENT-008) |
| Rule checks | fields with ranges or fixed values (scores, levels, industries) | within the expected range |
| Reference check | free-text fields (Problem, Gap, USP, NextSteps) | graded by a model judge with a written rubric, or by string rules |
| Stability | every agent | over three runs on the same input, enum fields agree and numeric fields stay within the tolerance stored with the golden set |

An entry passes when all checks pass. Triage is the exception: an entry passes on the schema and the accept decision that code derives from its signals, and a run also needs the agreement of every signal to reach a floor (REQ-TEST-006 AC5, [ADR 0087](../decisions/0087-triage-passes-on-the-decision-with-a-signal-floor.md)).

For triage and extraction the report also gives metrics that do not change the pass rule (REQ-TEST-007, ADR 0067): the confusion matrix, F1, and a breakdown per industry for triage; candidate precision, recall, and F1 by normalised quote overlap for extraction; the first-attempt, normalised-only, and dropped quote rates; where accepted quotes fall in the input; the Brier score of `Confidence`; and stability over three runs.

## Model judge

- A model judge uses a different model or provider than the agent it grades (OQ-020).
- Its rubric is versioned next to the golden set and gives a pass or fail per criterion, not a free score.
- Before a judge is used to block merges, it is checked against human labels on at least 20 outputs; its agreement with the humans is stored with the rubric.
- The judge of the Problem Discovery facts is `claude-haiku-5-5` through the Anthropic route of AI Gateway, with the rubric `agents/analysis/evals/problem-discovery.rubric.md`. It decides a benchmark round only after it agrees with the owner on at least 90 % of the facts of at least 20 outputs ([ADR 0093](../decisions/0093-analysis-agents-benchmark.md)).

## Thresholds

Each agent has a pass threshold: the share of golden set entries that pass, with a tolerance. The threshold and tolerance are written down and approved by a code owner before the agent's first eval run, stored with the golden set, and changed only through a reviewed pull request. They come from what the product needs, not from the first results. After the first runs the threshold is reviewed once with data. An eval run below threshold fails.

With 20 entries, one entry is five percentage points. Grow the golden set before tightening a threshold in steps smaller than that.

## Pipeline evals

Agent evals check each agent alone. The calibration set (REQ-SCORE-006, at least 60 opportunities) checks the whole pipeline: it compares the final scores with a reviewer ranking and reports the correlation with its 95 % confidence interval. It runs nightly and on changes to the scoring rules.

## When evals run

| Trigger | Model | Effect |
|---|---|---|
| Pull request from a branch in this repository that changes `packages/prompts`, model configuration, or an agent | live model through AI Gateway | blocks merge below threshold (REQ-TEST-004) |
| Pull request from a fork with such changes | none until a maintainer runs it from a branch in this repository | merge waits for that run |
| Nightly | live model through AI Gateway | reports regressions, does not block |
| Other pull requests | none | no eval run |

Eval runs that call live models use the secrets of the `evals` GitHub environment, which requires approval by a reviewer before a job starts, and never run on code from forks (ADR 0006). Search results for the Market Analysis and Competition evals are recorded fixtures (REQ-AGENT-013). Sampling settings are fixed in the model configuration for eval runs.

## Cost and latency

Because model calls go through AI Gateway (REQ-NFR-003), each eval run reports tokens, cost, and latency per agent. A large increase compared to the previous nightly run is flagged in the run summary. An eval run stops when it exceeds the eval budget configured for the `evals` environment.
