---
title: Decisions index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
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
| [0007](0007-score-review-annotates-score.md) | A score review annotates the score and never changes it | Accepted |
| [0008](0008-toolchain.md) | Toolchain: Node 24, pnpm, TypeScript, Zod, Vitest, Playwright | Accepted |
| [0009](0009-pdf-extraction-unpdf.md) | Extract PDF text with unpdf inside the Queue consumer | Accepted |
| [0010](0010-embedding-model-benchmark.md) | Choose the embedding model by benchmark, starting from bge-base-en-v1.5 | Accepted |
| [0011](0011-invitation-only-accounts-with-magic-links.md) | Invitation-only accounts with magic links sent through Resend | Accepted |
| [0012](0012-dashboard-on-workers-with-opennext.md) | Host the Next.js dashboard on Workers with the OpenNext adapter | Accepted |
| [0013](0013-search-tool-for-market-and-competitor-evidence.md) | Give Market Analysis and Competition a web search tool | Accepted |
| [0014](0014-abstract-first-content-policy.md) | Abstract-first content policy | Accepted |
| [0015](0015-one-candidate-one-opportunity.md) | One candidate, one opportunity, one publication in the MVP | Accepted |
| [0016](0016-web-output-safety-and-request-integrity.md) | Render model output as plain text and protect state-changing requests | Accepted |
| [0017](0017-durable-objects-for-global-limits.md) | Add Durable Objects for global limits | Accepted |
| [0018](0018-separate-auth-and-admin-api.md) | Separate the auth and admin API from the read API | Accepted |
| [0019](0019-organization-key-from-the-start.md) | Carry an organization key on user-owned records from the start | Accepted |
| [0020](0020-foundation-tooling.md) | Foundation tooling: lint, migrations, infrastructure bootstrap, accounts | Accepted |
| [0021](0021-data-api-two-writes.md) | Data API writes are score review and opportunity status | Accepted |
| [0022](0022-search-provider-candidates.md) | Benchmark Brave Search and Tavily for the search tool | Accepted |
| [0023](0023-daily-model-budget-formula.md) | Calibrate the daily model budget from measured cost | Accepted |
| [0024](0024-design-system-foundation.md) | Dashboard design system foundation | Accepted |
| [0025](0025-export-policy-mvp.md) | MVP export policy | Accepted |
| [0026](0026-wispel-cc-platform-domain.md) | wispel.cc as the platform domain | Accepted |
| [0027](0027-bootstrap-scope-and-vectorize-settings.md) | Bootstrap scope and Vectorize settings | Accepted |
| [0028](0028-freeze-migration-0001.md) | Freeze migration 0001 at the phase 1 tables | Accepted |
| [0029](0029-pdf-fetcher-host-policy.md) | PDF fetcher host policy | Accepted |
| [0030](0030-alert-delivery-in-phase-1.md) | Alert delivery in phase 1 | Accepted |
| [0031](0031-author-erasure-list.md) | Author erasure keeps a keyed-hash list | Accepted |
| [0032](0032-phase-1-cost-per-publication-is-an-estimate.md) | The phase 1 cost per publication is an estimate from real data | Accepted |
| [0033](0033-repository-hardening-guardrails.md) | Repository hardening is enforced by a CI check | Accepted |
| [0034](0034-openalex-free-api-key.md) | OpenAlex free API key for cursor paging | Accepted |
| [0035](0035-ninety-day-window-and-resumable-runs.md) | 90-day window and resumable runs | Accepted |
| [0036](0036-observable-signals-for-triage-and-extraction.md) | Decide triage and extraction from observable signals | Accepted |
| [0037](0037-eight-target-industries.md) | Eight target industries | Accepted |
| [0038](0038-topic-map-for-eight-industries.md) | Topic map for the eight target industries | Accepted |
| [0039](0039-private-search-fixtures-from-tavily.md) | Record search results as private fixtures, from Tavily | Accepted |
| [0040](0040-evidence-levels-and-readiness-label.md) | Evidence levels and a readiness label next to the score | Accepted |
| [0041](0041-short-backfill-and-primary-topic-scope.md) | 14-day backfill, 90-day storage limit, and primary-topic scope | Accepted |
| [0042](0042-arxiv-limit-on-first-submission-date.md) | arXiv 90-day limit on the date of the first version | Accepted |
| [0043](0043-node-integration-tests-and-network-guard.md) | Node integration tests with a network guard | Accepted |
| [0044](0044-weekly-production-release.md) | Weekly production release | Accepted |
| [0045](0045-delayed-queue-retries-and-ordered-pages.md) | Delayed queue retries and pages stored in order | Accepted |
| [0046](0046-automated-staging-pipeline.md) | Automated staging pipeline and scope sync | Accepted |
| [0047](0047-separate-document-queue.md) | A separate queue for PDF downloads | Accepted |
| [0048](0048-openalex-publication-types-with-abstract.md) | OpenAlex publication types with an abstract | Accepted |
| [0049](0049-workers-ai-for-pipeline-anthropic-for-judge.md) | Workers AI for the pipeline steps, Anthropic for the eval judge | Accepted |
| [0050](0050-no-candidate-without-an-actionable-party.md) | No extraction candidate without a party that can act | Accepted |
| [0051](0051-phase-1-exits-on-sufficient-data.md) | Phase 1 exits on sufficient data, not on a succeeded run | Accepted |
| [0052](0052-phase-1-requirement-status-sweep.md) | Phase 1 requirement status sweep and the dashboard split of REQ-NFR-002 | Accepted |
| [0053](0053-phase-2-queue-topology.md) | Phase 2 queue topology | Accepted |
| [0054](0054-processing-runs-and-model-call-records.md) | Processing runs and model-call records | Accepted |
| [0055](0055-daily-admission-and-budget-stop.md) | Daily admission to extraction and the budget stop | Accepted |
| [0056](0056-embedding-index-versioning.md) | Embedding index versioning and backfill | Accepted |
| [0057](0057-recall-at-10-fixture-corpus.md) | Fixture corpus for recall at 10 | Accepted |
| [0058](0058-thin-slice-read-route.md) | A read route for the thin slice | Accepted |
| [0059](0059-phase-2-budget-by-cost-component.md) | Phase 2 budget by cost component | Accepted |
| [0060](0060-golden-sets-of-triage-and-extraction-in-phase-2.md) | Golden sets of triage and extraction belong to phase 2 | Accepted |
| [0061](0061-retraction-check-looks-back-30-days.md) | The weekly retraction check looks back 30 days | Accepted |
| [0062](0062-replace-deprecated-benchmark-candidates.md) | Replace the benchmark candidates that Workers AI deprecates on 2026-11-20 | Accepted |
| [0068](0068-no-publication-dated-after-the-run-day.md) | No publication dated after the day of the run | Accepted |
| [0069](0069-longer-retry-delay-after-http-429.md) | A longer retry delay after HTTP 429 from a PDF host | Accepted |

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
