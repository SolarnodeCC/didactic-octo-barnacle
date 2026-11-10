---
title: "0073: A PDF host that stays unreachable is a data outcome, not an alert"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-DATA-004, REQ-DATA-010, REQ-DATA-011, REQ-NFR-019]
---

# 0073: A PDF host that stays unreachable is a data outcome, not an alert

- Decision status: Accepted
- Date: 2026-11-10
- Changes: the end of the PDF retries in [0045](0045-delayed-queue-retries-and-ordered-pages.md) and [0069](0069-longer-retry-delay-after-http-429.md); the page queue is unchanged

## Context

A PDF message whose download kept failing went to the dead-letter queue, and every dead letter raises an alert (REQ-NFR-019). On 7, 8 and 9 November 2026 this opened alert issues #91, #103 and #104. #104 alone collected 12 dead-lettered PDFs in 15 minutes. The last errors were:

- HTTP 520, 521 and 522: the publisher's server is down behind Cloudflare;
- HTTP 429;
- download and request timeouts.

All of them are on the publisher's side. Nobody can fix them, and the owner closed the issues as "not planned".

Meanwhile a real fault of the pipeline, such as a failed write to D1 or R2, reached the same dead-letter queue and was lost among them.

## Options considered

1. **Keep alerting on every PDF dead letter.** The alert stays noisy, and a real fault goes unseen.
2. **Leave the alert out in the dead-letter handler for PDF messages.** That hides our own errors too.
3. **Give up in the consumer on the last delivery, only for errors of the PDF host.**

## Decision

Option 3.

- On the delivery after the last retry (delivery 4, with `max_retries = 3` on `roi-documents-<env>`), the consumer gives up when the download still fails with a transient `PdfFetchError` (5xx, 429, or timeout). It does three things:
  - records the message as `failed`, with the reason `unavailable after 4 attempts: <code>: <message>`;
  - logs `document.unavailable` with the host;
  - acknowledges the message.
- No dead letter is written, so no alert is raised. The publication stays abstract-only (REQ-DATA-004 AC3).
- The message stays `failed`, not `completed`. So the PDF is queued again the next time a run stores that publication, and a host that is back gets another chance.
- Any other error still dead-letters the message and alerts. That covers a non-PDF error, a database failure, and a bug.
- Permanent PDF errors (not a PDF, too large, blocked URL) are still completed as `refused` at once, as before.
- The setting `Pdf.MaxRetries` in `apps/pipeline/src/config.ts` mirrors `max_retries` of the document queue. A unit test fails if the two drift apart.

## Consequences

- PDF dead-letter alerts now mean a fault of the pipeline. A missing PDF shows up as data quality instead: the PDF message outcomes in the `Staging measure` report and the run report (REQ-NFR-008).
- After a 429 the waits are 5, 10 and 20 minutes. The 40-minute fourth wait of ADR 0069 is gone, because the fourth delivery gives up.
- A publication that is not ingested again keeps no PDF. That matches the abstract-first policy (ADR 0014).
