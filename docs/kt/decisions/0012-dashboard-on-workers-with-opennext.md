---
title: "0012: Host the Next.js dashboard on Workers with the OpenNext adapter"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-DASH-001, REQ-NFR-007]
---

# 0012: Host the Next.js dashboard on Workers with the OpenNext adapter

- Decision status: Accepted
- Date: 2026-10-29

## Context

The original stack named Next.js on Cloudflare Pages (OQ-009). Cloudflare now recommends Workers for new Next.js projects, which keeps the dashboard on the same runtime, bindings, and deployment tooling as the API.

## Options considered

1. **Cloudflare Pages.** Matches the original wording. Pages may no longer be the recommended path for Next.js, and it adds a second deployment model.
2. **Workers with the OpenNext adapter.** One runtime and one Wrangler-based deployment for the API and the dashboard. The adapter must support the Next.js version in use.

## Decision

Option 2. The dashboard runs as a Worker built with the OpenNext adapter for Cloudflare. The dashboard and the API are served from one site (same registrable domain) so that they share the session cookie without cross-site requests (ADR 0016).

## Consequences

- Before the first dashboard code, verify the adapter's support for the chosen Next.js version, and record the pinned versions in the technology stack.
- REQ-NFR-002 lists Workers, Workflows, and Durable Objects as the runtime components; Pages is not used.
- End-to-end tests run against the same Worker build that is deployed.
