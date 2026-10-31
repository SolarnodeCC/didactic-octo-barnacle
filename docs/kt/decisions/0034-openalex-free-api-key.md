---
title: "0034: OpenAlex free API key for cursor paging"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-31
related: [REQ-DATA-001, REQ-DATA-009]
---

# 0034: OpenAlex free API key for cursor paging

- Decision status: Accepted
- Date: 2026-10-31
- Supersedes: the "OpenAlex API key or contact email" accounts note in ADR 0020

## Context

ADR 0020 said the collector uses an OpenAlex API key or a contact email. OpenAlex now issues free API keys that raise the daily budget, and cursor paging past the first page requires a free key. The collector uses cursor paging for incremental runs (REQ-DATA-001, REQ-DATA-009). A contact `mailto` parameter is no longer the documented way to identify the project.

## Options considered

1. **Stay keyless.** Works for a single page of results; further cursor pages are refused. Not enough for scheduled ingestion.
2. **Contact email (`mailto`) only.** No longer documented for scale or for cursor paging past the first page.
3. **Free OpenAlex API key** in `OPENALEX_API_KEY`, sent as `Authorization: Bearer` (or `api_key`). Required for cursor paging; 10× the keyless daily budget and 30 requests per second.

## Decision

Scheduled OpenAlex ingestion uses a free OpenAlex API key stored as `OPENALEX_API_KEY` (Worker secret / GitHub environment secret / Cursor environment secret). The collector sends it as a bearer token. Keyless calls remain allowed for local smoke tests of a single page. Details and rate limits are in [OpenAlex](../data-sources/openalex.md).

## Consequences

- Staging and production need `OPENALEX_API_KEY` before a full cursor-paged run can succeed.
- The project owner creates the key on openalex.org or through the agent key endpoint, activates it by email, and stores only the secret name in [operations](../operations.md).
- ADR 0020 still decides lint, migrations, bootstrap, and the paid Cloudflare Workers plan; its OpenAlex credential wording is superseded here.
