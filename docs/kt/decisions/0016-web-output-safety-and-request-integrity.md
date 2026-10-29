---
title: "0016: Render model output as plain text and protect state-changing requests"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-013, REQ-NFR-014, REQ-ACC-004]
---

# 0016: Render model output as plain text and protect state-changing requests

- Decision status: Accepted
- Date: 2026-10-29

## Context

The dashboard shows text and URLs written by models from untrusted papers and search results (competitor URLs, evidence URLs, rationales). The session is a cookie shared by the dashboard and the API, and the API accepts writes.

## Options considered

1. **Plain text and an https allowlist.** Smallest attack surface; no rich text from models.
2. **A sanitizer for limited markdown or HTML.** Richer display, but a larger surface that is hard to test.

## Decision

Option 1:

- All model-generated and source-derived text is rendered as plain text. No `dangerouslySetInnerHTML` or equivalent for such content.
- A URL is rendered as a link only when it uses `https`. Links use `rel="noopener noreferrer nofollow"` and open the external site in a new tab.
- The dashboard sets a strict Content Security Policy without `unsafe-inline` scripts, plus `X-Content-Type-Options`, `Referrer-Policy`, and `frame-ancestors 'none'`.
- Every state-changing request needs a CSRF token and a same-origin `Origin` check, on top of the `SameSite=Lax` cookie. The API does not enable CORS for other origins.
- Contract and end-to-end tests include hostile payloads (script tags, `javascript:` URLs, very long strings).

## Consequences

- REQ-NFR-013 and REQ-NFR-014 carry these rules.
- The dashboard and the API are served from one site (ADR 0012).
