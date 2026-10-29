---
title: Test data
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-003, REQ-TEST-005, REQ-DATA-010]
---

# Test data

## Fixtures for academic sources

- Responses from OpenAlex, arXiv, and Semantic Scholar are recorded once and stored as fixture files next to the tests that use them, as `fixtures/<source>/<case>.json` (or `.xml` for arXiv).
- Tests serve fixtures through the fetch mocking of the Workers test plugin. Unit, integration, and contract tests never call these APIs (REQ-TEST-003). A test that tries to reach the network fails.
- Refresh fixtures deliberately, in a separate pull request, and note why. Keep each fixture to the fields the test needs. A small recording script under `scripts/` is added with the first collector.
- Include error cases: rate limiting, timeouts, empty results, malformed records, a work without an abstract, a retracted work, and a preprint with two versions.

## Stubbed model responses

Contract and integration tests use stored model responses instead of live calls. Keep valid and invalid examples for every agent so the retry and rejection paths are tested, and at least one response to an injection fixture (REQ-NFR-006).

## Golden sets

Golden sets are described in [AI evals](ai-evals.md). Use only the metadata and abstract of a paper, which arXiv and OpenAlex provide under CC0, unless the paper's own license allows copying extracts of its full text (REQ-DATA-010).

## Privacy and secrets

- Use only publicly available paper metadata. Do not add personal data beyond the author names that are part of the public record (REQ-NFR-009).
- Never record credentials, request headers with tokens, or signed URLs into fixtures. Scrub them before committing.
- Keep machine-local paths out of fixtures and snapshots.

## Size

Keep fixture files small. A large corpus for evals or load tests belongs in object storage, not in git; record the location in [operations](../operations.md). Pull request jobs that need no secrets can only read a public corpus, so a corpus in a private bucket is used by the eval and nightly jobs only.
