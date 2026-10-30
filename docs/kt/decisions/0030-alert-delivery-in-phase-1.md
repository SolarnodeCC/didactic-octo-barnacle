---
title: "0030: Alert delivery in phase 1"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-NFR-008, REQ-NFR-019, REQ-ACC-007]
---

# 0030: Alert delivery in phase 1

- Decision status: Accepted
- Date: 2026-10-30

## Context

REQ-NFR-019 wants every alert by email and as a GitHub issue, with a link to the run report. In phase 1 there is no verified sending domain (`wispel.cc` is not yet set up in Resend, ADR 0026), no dashboard, and no admin API, so there is nothing to link to and no domain to send from.

## Options considered

1. **Sender:** the Resend test sender for staging, `wispel.cc` after it is verified, or the verified domain of another project. The test sender delivers only to the owner of the Resend account, which fits staging alerts to the ops owner. Another project's domain would mix two projects on one sender.
2. **Report link:** a file in R2, or the report inside the alert plus a fixed path for later. R2 objects cannot be opened without Cloudflare access, so they add little.

## Decision

- Staging sends from `onboarding@resend.dev` (`ALERT_EMAIL_FROM`). Production sets an address on the verified domain before launch (launch checklist).
- Each alert carries the run report summary and the fixed path `/admin/runs/<runId>`, which the admin API serves from phase 4.
- Deduplication state lives in D1 (`alert_state`), written only after a channel delivered.
- A dead-lettered message raises `dead-letter` (and closes its run as failed); `failed-run` is for a scheduled start that fails; `run-timeout` is for a run that outlives its window. One cause does not raise two alerts.

## Consequences

- The ops address is a Worker variable, never committed.
- Changing the sender is a configuration change.
- Budget-stop and availability alerts reuse the same sink when their requirements are built.
