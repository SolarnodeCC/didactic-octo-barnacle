---
title: "0026: wispel.cc as the platform domain"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-ACC-007, REQ-NFR-014]
---

# 0026: wispel.cc as the platform domain

- Decision status: Accepted
- Date: 2026-10-30

## Context

The KT documents require one site for the dashboard and the API (ADR 0012, ADR 0016) and a verified sending domain for account emails (REQ-ACC-007), but name no domain. The team owns `wispel.cc`.

## Options considered

1. **Leave the domain unnamed until launch.** No rework now; the session cookie scope, the `Origin` check and the email sender stay undefined.
2. **Use `wispel.cc` for the site and the email sender.** The product name stays "Research Opportunity Intelligence"; the domain is an address only.

## Decision

Option 2.

- The production dashboard and API are served from `wispel.cc`, one registrable domain, so the session cookie is never sent cross-site (REQ-NFR-014).
- The Resend sending domain is `wispel.cc`, verified with SPF, DKIM, and DMARC before launch (REQ-ACC-007).
- The domain is not a brand name. Product and documents keep "Research Opportunity Intelligence"; the dashboard shows `wispel.cc` only as an address (footer, emails, support contact).
- Hostnames for staging and preview, and any subdomain, are not decided here (OQ-035).

## Consequences

- No registrar or DNS credential goes in the repository; Cloudflare tokens stay in environment secrets (operations).
- The `Origin` check and the cookie `Domain` use `wispel.cc` and the hostnames OQ-035 adds.
- The [design system](../ux/README.md) writes the domain in lowercase plain text, never as a logo.
