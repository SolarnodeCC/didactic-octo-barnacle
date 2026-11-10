---
title: "0077: Keep every log line and trace of the deployed Worker"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-NFR-008, REQ-NFR-021]
---

# 0077: Keep every log line and trace of the deployed Worker

- Decision status: Accepted
- Date: 2026-11-10
- Changes: the `observability` tables of `env.staging` and `env.production` in `infrastructure/cloudflare/wrangler.toml`, and [monitoring](../operations.md#monitoring). No requirement changes.

## Context

The staging and production Workers only set `observability.enabled = true`. The Cloudflare dashboard's Observability page for the Worker turns on more: persisted logs with invocation logs, persisted traces, issue detection, a head sampling rate of 1, and readable query strings. It asks for the Wrangler configuration to say the same, because a deploy from the configuration replaces settings that were only made in the dashboard.

## Options considered

1. **Write the dashboard's settings into `wrangler.toml` for staging and production.** Chosen: the configuration stays the single source, and a deploy keeps the settings.
2. **Keep only `enabled = true` and set the rest in the dashboard.** Rejected: the next `wrangler deploy` would undo them, and no review sees the change.
3. **Sample fewer requests.** Rejected for now: a sampled-out failure could not be followed (REQ-NFR-008). The Worker's volume is set by the ingestion scope; revisit the rate if its log volume or cost grows past what the run reports need.

## Decision

Staging and production set, in their `observability` table:

- `enabled = true`, `head_sampling_rate = 1`, and `redact_query_string = false`;
- `logs`: `enabled`, `invocation_logs`, and `persist` true, `head_sampling_rate = 1`;
- `traces`: `enabled` and `persist` true, `head_sampling_rate = 1`;
- `issue_detection.enabled = true`.

The local and preview configurations are unchanged; `wrangler dev` does not upload logs, and the preview Worker is not deployed.

Query strings stay readable because the outbound requests carry no secrets in them: the OpenAlex key goes in the `Authorization` header, and arXiv and GitHub requests have no key in the URL.

## Consequences

- A run can be followed through its traces as well as its structured log lines.
- Wrangler 4.156 does not know `issue_detection` yet and prints `Unexpected fields found in observability field`. It still sends the table with the upload, and the deploy goes on. The warning goes away once Wrangler's schema has the key.
- A PDF URL from a publisher can carry a signed token in its query string; such a URL is visible in the traces. Set `redact_query_string = true` if a token must not be stored, and record that in a new ADR.
- `infrastructure/cloudflare/src/wrangler-config.test.ts` checks these settings for both environments.
