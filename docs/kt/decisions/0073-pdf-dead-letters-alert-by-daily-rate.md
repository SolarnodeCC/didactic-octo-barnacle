---
title: "0073: PDF dead letters alert by daily rate, and 526 and 530 are permanent"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-NFR-019, REQ-DATA-004, REQ-DATA-010, REQ-DATA-011]
---

# 0073: PDF dead letters alert by daily rate, and 526 and 530 are permanent

- Decision status: Accepted
- Date: 2026-11-10
- Changes: REQ-NFR-019 AC1 for `document.ingest` dead letters, and the retry rule of the PDF fetcher in [orchestration](../architecture/orchestration.md)

## Context

From 7 to 10 November 2026 staging completed about 1,100 to 2,000 `document.ingest` messages a day and dead-lettered 5, 12, 13, and 31 (about 0.5 to 1.5%). The last errors were publisher-side: Cloudflare 520 to 523, 526 (invalid TLS certificate), and 530 (origin not resolved), 500 and 503, 429, and timeouts. Every one raised a `dead-letter` alert: one GitHub issue a day with 8 to 27 comments (issues 91, 103, 104, 107) and email.

A PDF problem never fails an ingestion run (ADR 0047), the dead letters are counted in the run report and in `Staging measure`, and a dead-lettered PDF can be replayed. A single PDF dead letter needs no person; a sudden rise in their share does, because it points at the fetcher or the network rather than at one publisher. A 526 or 530 fails the same way on every retry.

## Options considered

1. **Keep one alert per dead letter.** Daily noise that hides the alerts that matter.
2. **No alerts for PDF dead letters.** A broken fetcher would go unnoticed.
3. **Alert on the daily share, and stop retrying 526 and 530.** Chosen.

## Decision

- A dead-lettered `document.ingest` message is recorded with its last error and counted as before, but raises no alert of its own.
- One `pdf-dead-letter-rate` alert is raised on the dead letter that lifts the share of dead-lettered `document.ingest` messages of that UTC day above `pdf.dead_letter_alert_share` (0.05), once the day has at least `pdf.dead_letter_alert_min_messages` (200) such messages. The summary carries counts and the percentage only (REQ-NFR-019 AC4).
- Dead letters of every other message type keep their `dead-letter` alert.
- The PDF fetcher treats HTTP 526 and 530 as permanent, like a 404: the message completes with the reason and is not retried. Other 5xx, 408, 429, timeouts, and network errors are still retried.

## Consequences

- The daily alert issue for PDF dead letters goes away at the current rates; a day above 5% still opens one.
- Messages that end in 526 or 530 move from dead-lettered to completed with `http-status`, so they are not replayed. A publisher that fixes its certificate is reached again only when the publication is stored again without a document.
- The share counts messages by the day of their last update, so a retry that crosses midnight counts on the later day.
