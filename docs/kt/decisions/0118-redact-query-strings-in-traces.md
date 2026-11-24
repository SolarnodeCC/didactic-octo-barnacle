---
title: "0118: Staging and production redact query strings in traces"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-008, REQ-NFR-021]
---

# 0118: Staging and production redact query strings in traces

- Decision status: Accepted
- Date: 2026-11-24
- Changes: the `observability` tables of `env.staging` and `env.production` in `infrastructure/cloudflare/wrangler.toml`, REQ-NFR-021 (criterion 13), [ADR 0077](0077-full-workers-observability.md)

## Context

ADR 0077 kept query strings readable in Workers Observability and noted that a publisher's PDF URL can carry a signed download token. The security review of 2026-11-23 (issue 178, medium) asked to redact them: anyone with read access to Observability could reuse a still-valid signed URL.

## Options considered

1. **Set `redact_query_string = true` in staging and production.** One line per environment; traces keep the host and path.
2. **Strip query strings before each log line.** The pipeline's own log lines already name only the host. Traces of outbound requests are recorded by the runtime, so code cannot strip them.

## Decision

Option 1. `infrastructure/cloudflare/src/wrangler-config.test.ts` checks the setting for both environments and fails when any environment sets it to `false`.

## Consequences

- A trace no longer shows query parameters of outbound requests. OpenAlex filters and arXiv queries are in the run reports and the pipeline's log lines, so a run can still be followed (REQ-NFR-008).
- The other settings of ADR 0077 are unchanged.
