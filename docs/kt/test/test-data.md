---
title: Test data
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-TEST-003]
---

# Test data

## Fixtures for academic sources

- Responses from OpenAlex, arXiv, and Semantic Scholar are recorded once and stored as fixture files next to the tests that use them.
- Pull request CI never calls these APIs (REQ-TEST-003). A test that tries to reach the network fails.
- Refresh fixtures deliberately, in a separate pull request, and note why. Keep each fixture to the fields the test needs.
- Include error cases: rate limiting, timeouts, empty results, and malformed records.

## Stubbed model responses

Contract and integration tests use stored model responses instead of live calls. Keep valid and invalid examples for every agent so the retry and rejection paths are tested.

## Golden sets

Golden sets are described in [AI evals](ai-evals.md).

## Privacy and secrets

- Use only publicly available paper metadata. Do not add personal data beyond the author names that are part of the public record.
- Never record credentials, request headers with tokens, or signed URLs into fixtures. Scrub them before committing.
- Keep machine-local paths out of fixtures and snapshots.

## Size

Keep fixture files small. A large corpus for evals or search tests belongs in object storage that CI can read, not in git; record the location in [operations](../operations.md).
