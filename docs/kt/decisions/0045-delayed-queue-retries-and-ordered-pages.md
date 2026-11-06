---
title: "0045: Delayed queue retries and pages stored in order"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-002, REQ-DATA-009, REQ-DATA-011, REQ-NFR-021]
---

# 0045: Delayed queue retries and pages stored in order

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the retry behaviour of the queue consumer of [0035](0035-ninety-day-window-and-resumable-runs.md); the queue settings in `infrastructure/cloudflare/wrangler.toml` stay

## Context

Between 31 October and 4 November 2026, staging opened six dead-letter alerts: four for arXiv page messages and two for `document.ingest`. Alert #70 shows a run whose page 16 used up its retries, so the run was closed as failed.

The consumer called `message.retry()` without a delay. As a result:

- All `max_retries = 3` retries came back within seconds.
- They also came back faster than the arXiv request interval of 3 s.
- A short upstream outage or throttle therefore used up every retry.

The review of the same code found two more problems:

- **Pages could be counted out of order.** A page sends the message for the next page before it commits, and every page reads its cursor from the run row. If the commit fails after the send, the next page runs with the cursor of the page before it.
- **The claim could race.** `claimMessage` read the log and then inserted into it. Two deliveries of a new message could then both insert, and one fails on the unique key.

## Options considered

1. **`retry_delay` in `wrangler.toml`.** One fixed delay for every message. It does not grow, and every environment block has to change.
2. **A delay per retry from the consumer.** `message.retry({ delaySeconds })` doubles the delay on each delivery and adds jitter.
3. **Carry the cursor in the message.** This would make each page independent of the run row. It changes the message schema (REQ-DATA-011 AC2), and a page would still be counted twice.

## Decision

- **Option 2.** The delay is 30 s × 2^(attempt − 1), capped at 15 minutes, with ±20 % jitter (`retryDelaySeconds` in `apps/pipeline/src/queue/consume.ts`). With `max_retries = 3`, a message is retried over about 3.5 minutes instead of a few seconds.
- **Backoff inside a request** (`fetchWithBackoff`):
  - The computed delay gets the same ±20 % jitter.
  - `Retry-After` is read as delay-seconds or as an HTTP date (RFC 9110).
- **Pages are stored in order.** A page is processed only when `pages_done` of its run equals its page number:
  - A page that arrives early throws, and is retried with the delay above.
  - A page that is already counted is completed without a fetch.
- **The claim is one statement:** `INSERT ... ON CONFLICT (message_id) DO UPDATE ... WHERE status NOT IN ('completed', 'dead-lettered') RETURNING status`.
- **The arXiv rate limiter is created once per isolate,** so a retried page that lands in the same isolate keeps the 3 s interval.

## Consequences

- An outage of up to a few minutes no longer fails a run. A longer one still lands in the dead-letter queue and raises an alert (REQ-NFR-019).
- A run takes at most the sum of its delays longer. The run timeout is unchanged.
- The page order rule adds no query: the run row is already read.
- The six alerts are closed once a staging run after the deploy finishes without a dead letter.
