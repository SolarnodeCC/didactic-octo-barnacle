---
title: "0047: A separate queue for PDF downloads"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-004, REQ-DATA-009, REQ-DATA-010, REQ-DATA-011, REQ-NFR-010, REQ-NFR-020]
---

# 0047: A separate queue for PDF downloads

- Decision status: Accepted
- Date: 2026-11-06
- Changes: the single publication queue of [0035](0035-ninety-day-window-and-resumable-runs.md); the retry delays of [0045](0045-delayed-queue-retries-and-ordered-pages.md) stay

## Context

Page messages (`source.fetch_page`) and PDF messages (`document.ingest`) shared one queue, consumed one message at a time (`max_batch_size = 1`, `max_concurrency = 1`). Pages need that setting: each page reads the cursor that the page before it saved (ADR 0045). PDFs do not. Each one is independent, but a download can take up to the fetcher's 20-second timeout and 25 MB.

As a result:

- A page with 100 storable PDFs queued 100 downloads in front of the next page.
- A run of 50 pages could queue thousands of downloads, all processed one by one, with the pages waiting behind them.
- The fetcher also held each file twice at its peak: the chunks it read, then the copy they were joined into. That is up to 50 MB in a 128 MB isolate.

## Options considered

1. **Raise the concurrency of the shared queue.** PDFs would run in parallel, but so would pages, which breaks the page order of ADR 0045.
2. **A second queue for PDFs.** Pages keep one message at a time; PDFs get their own batch size, concurrency and dead-letter queue.
3. **A Workflow per document.** It also isolates PDFs, but it adds a runtime the phase 1 pipeline does not have yet, for work a queue already does.

## Decision

- **Option 2.** Each environment gets `roi-documents-<env>` and its dead-letter queue `roi-documents-dlq-<env>`, bound as `DOCUMENT_QUEUE`.
- **Consumer settings:** `max_batch_size = 5`, `max_concurrency = 5`, `max_retries = 3`. Retry delays come from the consumer, as for pages (ADR 0045).
- **The page queue stays as it is:** one message at a time, in order.
- **Routing:**
  - The page consumer sends `document.ingest` messages to `DOCUMENT_QUEUE` with `sendBatch`.
  - A replayed dead-lettered PDF message goes back to that queue too.
  - The Worker consumes all four queues. It tells a dead-letter queue by the `-dlq-` in its name, and a message by its type.
- **Bootstrap** (REQ-NFR-020) lists the two new queues, so drift shows them as missing until `Staging bootstrap` runs with `apply`. The automated staging pipeline (ADR 0046) stops before the deploy while they are missing. The deploy would fail anyway, because Wrangler refuses a binding to a queue that does not exist.
- **Memory:** when the server sends a `content-length` within the size limit, the fetcher reads the body into one buffer of that size. A longer body, for example a compressed transfer, falls back to collecting chunks, and the size limit holds either way.

## Consequences

- A slow or failing download no longer delays the pages of a run, and up to 25 downloads run at once (5 batches of 5).
- PDF dead letters are counted and alerted as before (REQ-NFR-019). They do not close the run, because a PDF message carries no run ID.
- **Rollout order for each environment:**
  1. Run bootstrap with `apply`.
  2. Deploy.
  3. Messages still in the old queue are consumed there as before, because the consumer routes by message type.
- Peak memory per PDF is about its size instead of twice its size.
