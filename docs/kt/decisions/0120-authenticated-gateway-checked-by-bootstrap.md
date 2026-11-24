---
title: "0120: Bootstrap creates and checks every AI Gateway with authentication on"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-003, REQ-NFR-005, REQ-NFR-020]
---

# 0120: Bootstrap creates and checks every AI Gateway with authentication on

- Decision status: Accepted
- Date: 2026-11-24
- Changes: REQ-NFR-003 (criterion 3), [security](../architecture/security.md#model-providers), [operations](../operations.md#secrets)

## Context

ADR 0074 says each AI Gateway has Authenticated Gateway on. The security review of 2026-11-23 (issue 177, high) found that nothing in the repository creates or checks that setting, and that [operations](../operations.md) listed `AI_GATEWAY_ACCOUNT_ID` and `AI_GATEWAY_API_TOKEN` as Worker secrets that no code reads. With authentication off, anyone with access to the account could spend through a gateway without a gateway token, outside the Worker's daily budget.

Cloudflare documents three facts this decision relies on: a request through a Workers AI binding is authenticated within the account and needs no `cf-aig-authorization` header; a gateway created through the API has authentication on unless `false` is sent; and once on, authentication cannot be turned off.

## Options considered

1. **Create gateways with authentication on and fail the drift check when a gateway has it off.** The check runs before every staging deploy and in the scheduled checks.
2. **Turn authentication on from bootstrap apply.** The update call needs the gateway's other settings and could overwrite changes made in the dashboard, and the change cannot be undone, so it stays a deliberate step by the owner.
3. **Give the Worker a gateway token.** Not needed: the binding is already authenticated.

## Decision

Option 1.

- Bootstrap sends `authentication: true` when it creates a gateway.
- The Cloudflare client reads `authentication` with each gateway. Anything other than `true` counts as off, so a renamed or missing field fails the check instead of passing it.
- The drift report lists the environment's gateways with authentication off as `Unauthenticated`. `--fail-on-drift` exits 3 when the list is not empty and names the gateway and where to turn it on. `Staging deploy` and `Staging scheduled checks` already run `--fail-on-drift`.
- The Worker keeps calling through its binding and holds no gateway token. The unused `AI_GATEWAY_*` Worker secrets are removed from [operations](../operations.md#secrets); a client over HTTP, such as the benchmark, sends its own token.

## Consequences

- If a gateway has authentication off today, the next staging deploy stops until the owner turns it on in the dashboard.
- The check reads only what the API reports. The token in `CLOUDFLARE_API_TOKEN` needs AI Gateway Read, which bootstrap already uses to list gateways.
