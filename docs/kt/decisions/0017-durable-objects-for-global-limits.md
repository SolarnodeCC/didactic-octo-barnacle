---
title: "0017: Add Durable Objects for global limits"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-AGENT-012, REQ-ACC-005]
---

# 0017: Add Durable Objects for global limits

- Decision status: Accepted
- Date: 2026-10-29

## Context

REQ-AGENT-012 needs a limit on model calls in flight across all Worker instances, and REQ-ACC-005 needs rate limits per email and per IP. Worker instances share no memory, so a per-instance counter does not work. Durable Objects are not in the technology stack, and REQ-NFR-002 requires an ADR to add a service.

## Options considered

1. **Durable Objects as counters and semaphores.** Exact, serialized state with clear semantics.
2. **Queue consumer concurrency, Workflow limits, and AI Gateway rate limits only.** No new service, but the limit is approximate and sign-in rate limiting still has no primitive.

## Decision

Option 1. Add Durable Objects to the stack, with one class for a keyed counter and semaphore. Uses: the global model-call semaphore with a lease timeout (a crashed holder cannot block others), and the sign-in and token-use rate limits. AI Gateway rate limits stay as a second guard.

## Consequences

- The technology stack lists Durable Objects, and the environments get their own namespace.
- Leases expire, so a lost release never blocks the platform.
- Tests use the local Durable Object runtime.
