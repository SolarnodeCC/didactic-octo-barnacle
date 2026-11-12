---
title: "0094: Judge calls are paid through AI Gateway Unified Billing"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-12
related: [REQ-NFR-003, REQ-NFR-005, REQ-TEST-005]
---

# 0094: Judge calls are paid through AI Gateway Unified Billing

- Decision status: Accepted
- Date: 2026-11-12
- Changes: how the fact judge of [ADR 0093](0093-analysis-agents-benchmark.md) is paid and authenticated; the key of ADR 0049 and ADR 0093 is not used while Unified Billing is on. No requirement changes.

## Context

The first test call of the judge, on 2026-11-12, failed with HTTP 402 "Insufficient unified billing credits" from the gateway `roi-staging`. Its settings show `wholesale: true` (Unified Billing: Cloudflare pays the provider and charges the account's AI Gateway credits) and `authentication: true`. With Unified Billing on, the gateway answered 402 with the Anthropic key in the request, with a wrong key, and with no key, so it does not use a key sent with the request. The same test showed that `messages.parse` of the SDK returns a plain promise, which has no `withResponse` and so no gateway log ID; the judge now calls `messages.create` and validates the answer against the same schema itself.

## Options considered

1. **Add Unified Billing credits** to the account. Chosen by the owner: the fix the error names, and no provider key passes through the session or CI.
2. **Turn Unified Billing off** on `roi-staging`, so the gateway uses the key in the request.
3. **Store the Anthropic key in the gateway** as a provider key; whether it takes precedence over Unified Billing was not verified.
4. **A Workers AI judge**; reverses the Anthropic judge of ADR 0049.

## Decision

- Judge calls go through the Anthropic route of `roi-staging` and are paid from its Unified Billing credits. The owner keeps the credits topped up; a round of the analysis benchmark costs about USD 0.15 in judge calls.
- `EVAL_ANTHROPIC_API_KEY` is optional: the benchmark command sends it when it is set, for a gateway without Unified Billing, and a placeholder otherwise. When `EVAL_AI_GATEWAY_TOKEN` is set, it sends it as `cf-aig-authorization`, the token of an authenticated gateway.
- The judge's cost stays in the round's budget (ADR 0093); the gateway log records the billed cost, and the round's results compare the two (ADR 0054).

## Consequences

- The Anthropic key saved as a network secret of the cloud session for `gateway.ai.cloudflare.com` is not used while Unified Billing is on; the owner may remove it.
- When the credits run out, judge calls fail with 402 and count as judge errors, which fail their entries; a round then shows judge errors instead of verdicts.
