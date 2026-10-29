---
title: Decisions index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Architecture decision records

One decision per file, numbered in order: `NNNN-short-title.md`. A decision is never edited after it is accepted; a new ADR supersedes it. Accepted ADRs are exempt from the 90-day review warning of `scripts/check-kt.py`.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-kt-documents-are-source-of-truth.md) | KT documents are the source of truth | Accepted |
| [0003](0003-agent-runtime-langgraph-js.md) | Run agents with LangGraph.js inside Cloudflare Workflows | Proposed |
| [0004](0004-map-layers-to-cloudflare-services.md) | Map architecture layers to Cloudflare services | Proposed |
| [0005](0005-derive-category-scores.md) | Derive score categories from agent output | Proposed |
| [0006](0006-evals-in-pull-requests.md) | Run live evals only for pull requests from this repository | Proposed |
| [0007](0007-score-review-annotates-score.md) | A score review annotates the score and never changes it | Proposed |
| [0008](0008-toolchain.md) | Toolchain: Node 24, pnpm, TypeScript, Zod, Vitest, Playwright | Accepted |
| [0009](0009-pdf-extraction-unpdf.md) | Extract PDF text with unpdf inside the Queue consumer | Accepted |
| [0010](0010-embedding-model-benchmark.md) | Choose the embedding model by benchmark, starting from bge-base-en-v1.5 | Accepted |
| [0011](0011-invitation-only-accounts-with-magic-links.md) | Invitation-only accounts with magic links sent through Resend | Proposed |

## When an ADR is needed

Write an ADR when a change:

- adds, replaces, or removes a technology, service, or external data source;
- changes how components talk to each other, where data is stored, or how it is identified;
- changes the scoring model, an eval threshold policy, or a CI gate;
- is hard to reverse, or the team discussed alternatives before choosing.

A choice that is easy to change later and touches one package, such as a helper library, needs no ADR.

## Lifecycle

1. **Proposed**: the ADR is merged with frontmatter `status: draft`. The documents may refer to it as a proposal, not as a decision.
2. **Accepted**: a code owner of `docs/kt` accepts it in a pull request that sets `Decision status: Accepted`, sets frontmatter `status: approved`, and updates the documents it affects.
3. **Superseded**: a new ADR replaces it. The old ADR only gets `Superseded by NNNN` in its decision status.

Open questions that may become ADRs are listed in [open questions](../open-questions.md).

## Template

```markdown
---
title: "NNNN: Title"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-NFR-002]
---

# NNNN: Title

- Decision status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

## Options considered

## Decision

## Consequences
```
