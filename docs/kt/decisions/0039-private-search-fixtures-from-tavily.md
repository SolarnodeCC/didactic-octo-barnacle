---
title: "0039: Record search results as private fixtures, from Tavily"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-03
related: [REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-013, REQ-TEST-003, REQ-TEST-005, REQ-DATA-010]
---

# 0039: Record search results as private fixtures, from Tavily

- Decision status: Accepted
- Date: 2026-11-03

## Context

Market Analysis, Competition, and Startup Generator use the search tool (ADR 0013), and their golden sets and contract tests must replay recorded search results, because tests never call the network (REQ-TEST-003, REQ-AGENT-013). The agent tools of the owner's session return summaries, not the literal fragments, so the golden sets need recordings made from a provider API.

[ADR 0022](0022-search-provider-candidates.md) named Brave Search and Tavily as candidates and left the terms for storing results open. The owner read the Brave terms: section 3(b) forbids storing and evaluating results unless Brave agrees otherwise. Tavily's Platform Terms of Service (updated 2026-05-04) and Acceptable Use Policy (updated 2026-10-21) were read in full on 2026-11-03, and they say this:

- They do not address storing or caching results (Output, section 1.6), using results to evaluate or test systems, or publishing results in a public repository. The Acceptable Use Policy bans access to the Services by automated means except as the Services permit, which the API does.
- The grant is for the customer's internal business purposes (sections 2 and 3.2).
- Output must not be used to develop models that compete with Tavily (6.6(i)). The customer must not disclose performance information or analysis about the Services to a third party (3.2(x)).
- The customer verifies all Output itself (6.4, AUP section 5), and Output may rest on third-party public content over which Tavily has no control (13.2). Tavily may change the terms at any time (17.7).

## Options considered

1. **Commit recorded results to the repository.** Simple to replay, but the repository is public, and publishing third-party result content is neither permitted nor forbidden by the terms.
2. **Record from Tavily and keep the recordings private; keep only a manifest in the repository.** Uses the provider whose terms do not forbid it, and publishes no result content.
3. **Record from Brave.** Forbidden by default (section 3(b)) until Brave agrees in writing.
4. **Hand-write search results.** No licence question, but the fixtures would not resemble real results, so the evals would not measure the agent.

## Decision

Option 2.

- Search fixtures are recorded from the Tavily API with the key held as a network secret for `api.tavily.com`. The key is never in the repository.
- A recording is stored in a private object store (a private R2 bucket), never in git. The repository holds a manifest per recording: the query, the date, the provider, the parameters, the number of results, and a SHA-256 hash of the stored response. The manifest holds no result text. A golden-set entry names a recording by its manifest ID.
- Evals that need recordings run only where the private store is readable: a pull request from a branch in this repository with the secrets, as for live evals (REQ-TEST-004, criterion 3). A pull request from a fork does not run them.
- Recordings are used only to test and evaluate our own agents, which is an internal business purpose. They are not used to train or fine-tune any model, and not shared outside the organization.
- No benchmark result that compares Tavily with another provider is published (the OQ-033 comparison stays internal), because of 3.2(x).
- Brave stays a candidate for production. Whether Brave allows storage and evaluation is asked in writing before the phase-3 comparison (see the [review brief](../legal/review-brief.md), item 12).
- Tavily is asked to confirm in writing that storing Output as private evaluation fixtures is allowed (item 11). Until it answers, recordings stay private and no recording is shared.

## Consequences

- The golden sets for Market Analysis, Competition, and Startup Generator refer to manifests, not files, so they need the private bucket and a read token in CI before they can be written. They are not part of this change.
- The golden-set rule that fixtures hold abstracts only (REQ-DATA-010) does not change for academic sources. Search results are a separate class with the rules above ([test data](../test/test-data.md)).
- A change in Tavily's terms, or an answer to item 11 or 12, can reverse this decision. The manifest keeps a recording replaceable by re-running its query.
- Phase 3 production use of any search provider still waits for the data processing agreement answers (review brief, item 8).
