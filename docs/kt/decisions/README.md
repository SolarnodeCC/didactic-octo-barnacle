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
| [0003](0003-agent-runtime-typescript-workflows.md) | Run agents as plain TypeScript steps inside Cloudflare Workflows | Accepted |
| [0004](0004-map-layers-to-cloudflare-services.md) | Map architecture layers to Cloudflare services | Accepted |
| [0005](0005-derive-category-scores.md) | Derive score categories from agent output | Accepted |
| [0006](0006-evals-in-pull-requests.md) | Run live evals only for pull requests from this repository | Accepted |
| [0007](0007-score-review-annotates-score.md) | A score review annotates the score and never changes it | Proposed |
| [0008](0008-toolchain.md) | Toolchain: Node 24, pnpm, TypeScript, Zod, Vitest, Playwright | Accepted |
| [0009](0009-pdf-extraction-unpdf.md) | Extract PDF text with unpdf inside the Queue consumer | Accepted |
| [0010](0010-embedding-model-benchmark.md) | Choose the embedding model by benchmark, starting from bge-base-en-v1.5 | Accepted |
| [0011](0011-invitation-only-accounts-with-magic-links.md) | Invitation-only accounts with magic links sent through Resend | Proposed |
| [0012](0012-dashboard-on-workers-with-opennext.md) | Host the Next.js dashboard on Workers with the OpenNext adapter | Accepted |
| [0013](0013-search-tool-for-market-and-competitor-evidence.md) | Give Market Analysis and Competition a web search tool | Accepted |
| [0014](0014-abstract-first-content-policy.md) | Abstract-first content policy | Accepted |
| [0015](0015-one-candidate-one-opportunity.md) | One candidate, one opportunity, one publication in the MVP | Accepted |
| [0016](0016-web-output-safety-and-request-integrity.md) | Render model output as plain text and protect state-changing requests | Accepted |
| [0017](0017-durable-objects-for-global-limits.md) | Add Durable Objects for global limits | Accepted |
| [0018](0018-separate-auth-and-admin-api.md) | Separate the auth and admin API from the read API | Accepted |
| [0019](0019-organization-key-from-the-start.md) | Carry an organization key on user-owned records from the start | Accepted |

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
