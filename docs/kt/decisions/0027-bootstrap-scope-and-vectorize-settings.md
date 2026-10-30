---
title: "0027: Bootstrap scope and Vectorize settings"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-NFR-020, REQ-NFR-002, REQ-AGENT-012, REQ-PROC-001]
---

# 0027: Bootstrap scope and Vectorize settings

- Decision status: Accepted
- Date: 2026-10-30

## Context

ADR 0020 says the bootstrap script creates D1, R2, Queues with dead-letter queues, Vectorize, Durable Object namespaces, and AI Gateway. Building the live Cloudflare client showed two things. Cloudflare has no API to create a Durable Object namespace on its own: it appears when a Worker that declares a Durable Object class is deployed. And a Vectorize index cannot change its dimensions or metric after it is created.

## Options considered

1. **Create a placeholder Worker to force a namespace.** Rejected: it deploys code with no purpose and breaks when the real class arrives.
2. **Leave Durable Object namespaces to the Worker deploy.** The Worker declares the class and a migration in `wrangler.toml` when the first class exists (REQ-AGENT-012, ADR 0017).
3. **Delay the Vectorize index until the embedding benchmark (ADR 0010).** Safer for the dimension, but staging then has no index while phase 1 measures volume.

## Decision

Options 2 and 3 combined in this way: the bootstrap script no longer lists Durable Object namespaces. It creates the Vectorize index with the settings of the interim embedding model (`bge-base-en-v1.5`, `docs/kt/architecture/defaults.md`): 768 dimensions and cosine distance. If the benchmark at the start of phase 2 picks a model with other settings, the index is recreated; it holds no data before phase 2.

## Consequences

- `desiredResources` in `infrastructure/cloudflare/src/bootstrap.ts` has six resources per environment.
- The Durable Object class and its `wrangler.toml` migration are added with the first feature that needs it.
- A changed embedding model means a new index name or a delete and recreate, and a re-embedding of all stored vectors (REQ-PROC-001).
- ADR 0020 is unchanged in its other parts.
