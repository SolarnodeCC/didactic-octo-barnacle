---
title: AI evals
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-004, REQ-TEST-005, REQ-NFR-003]
---

# AI evals

Agent output comes from language models and varies between runs. Exact assertions do not work, so quality is measured with evals.

## Golden sets

- One golden set per agent, of at least 20 papers (REQ-TEST-005), stored under the agent's test directory.
- Each entry holds the input (paper metadata and extract) and a reviewed expected outcome: required facts, acceptable ranges for numeric fields, and outcomes that must not occur.
- Cover all four target industries and include papers that should yield no opportunity.
- Changes to a golden set need review by a code owner of `docs/kt`.

## How output is scored

| Check | Applies to | Pass rule |
|---|---|---|
| Schema | every output | must pass, always |
| Rule checks | fields with ranges or fixed values (scores, levels, industries) | within the expected range |
| Reference check | free-text fields (Problem, Gap, USP) | graded by a model judge with a written rubric, or by string rules |
| Stability | every agent | repeated runs on the same input stay in the same score band |

A model judge uses a different model or provider than the agent it grades, and its rubric is versioned next to the golden set.

## Thresholds

Each agent has a pass threshold: the share of golden set entries that pass. The threshold is set when the agent's first eval runs, stored with the golden set, and changed only through a reviewed pull request. An eval run below threshold fails.

## When evals run

| Trigger | Model | Effect |
|---|---|---|
| Pull request changing `packages/prompts`, model configuration, or an agent | live model through AI Gateway | blocks merge below threshold (REQ-TEST-004) |
| Nightly | live model through AI Gateway | reports regressions, does not block |
| Other pull requests | none | no eval run |

Eval runs that call live models use credentials from GitHub Actions secrets and run only on trusted branches, never on pull requests from forks.

## Cost and latency

Because model calls go through AI Gateway (REQ-NFR-003), each eval run reports tokens, cost, and latency per agent. A large increase compared to the previous nightly run is flagged in the run summary.
