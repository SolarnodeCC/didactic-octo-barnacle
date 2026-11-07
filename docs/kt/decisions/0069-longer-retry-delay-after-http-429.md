---
title: "0069: A longer retry delay after HTTP 429 from a PDF host"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-DATA-004, REQ-DATA-011, REQ-NFR-021]
---

# 0069: A longer retry delay after HTTP 429 from a PDF host

- Decision status: Accepted
- Date: 2026-11-07
- Changes: REQ-DATA-011 (new AC6) and the retry delay of the document consumer ([0045](0045-delayed-queue-retries-and-ordered-pages.md), [0047](0047-separate-document-queue.md))

## Context

Alert issue 91 of 7 November 2026 reported PDF downloads dead-lettered after their retries. Of the 16 dead-lettered `document.ingest` messages, 8 came from `www.biorxiv.org` and 3 of those ended on HTTP 429. Other publishers completed hundreds of downloads each (Springer 418, Wiley 333, Nature 325). A PDF message is retried three times, after 30, 60, and 120 seconds with jitter, so about three and a half minutes in all. A host that limits requests needs longer than that, and the retries only added requests to the host that had asked us to slow down.

## Options considered

1. **A longer delay after a 429, honoring `Retry-After`.** Chosen by the owner.
2. **A shared limit per host** in a Durable Object. It prevents 429s, but adds a component and its own failure mode.
3. **Leave it** and replay the dead letters by hand.

## Decision

- The PDF fetcher keeps the HTTP status and the `Retry-After` of a refused response (`PdfFetchError.Status` and `RetryAfterSeconds`).
- For a message that failed with status 429, the consumer retries after 5 minutes, then 10, 20, and 40, and never more than an hour, with 20 % jitter. When the host sent a `Retry-After` that is longer, it is used instead, capped at an hour (REQ-NFR-021).
- Every other error keeps the delay of ADR 0045: 30 seconds, doubling, up to 15 minutes.
- The retry count (`max_retries` 3 of the documents queue) does not change.

## Consequences

- A PDF message that a host rate-limits can wait about 75 minutes in all (5, 10, and 20 minutes, and the fourth delivery's 40 minutes before it is dead-lettered). A PDF holds up no ingestion run (ADR 0047), so the longer wait costs only the time until the file is stored.
- Requests to a host still run in parallel for all its messages. A limit per host stays an option if 429s continue after this change.
- The 16 messages already dead-lettered are not affected. They can be replayed with the replay function.
