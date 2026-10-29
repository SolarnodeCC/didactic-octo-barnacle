---
title: "0009: Extract PDF text with unpdf inside the Queue consumer"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DATA-006, REQ-DATA-004, REQ-DATA-010, REQ-NFR-002]
---

# 0009: Extract PDF text with unpdf inside the Queue consumer

- Decision status: Accepted
- Date: 2026-10-29

## Context

OQ-006 asks how text is extracted from PDFs within Worker limits. On the paid plan, CPU time for an HTTP request defaults to 30 seconds (maximum 5 minutes) and excludes time waiting on the network; memory is 128 MB per isolate, including WebAssembly allocations. The free plan allows 10 ms of CPU and cannot run extraction. Document processing is a Queue consumer Worker with PDFs and text in R2 (ADR 0004). Check the current values in the Cloudflare documentation before relying on them.

## Options considered

1. **unpdf in the Queue consumer.** A PDF.js wrapper with a serverless build for Workers. Runs inside the stack with no new service. Memory use on large PDFs is the risk, and it extracts text only, so it does not read scanned PDFs.
2. **A Cloudflare-hosted conversion service.** May handle layout better and use less Worker memory, but adds a dependency and possibly cost. Its limits and formats are unverified.

## Decision

Option 1:

- Extract text with unpdf in the document-processing Queue consumer, one PDF per invocation.
- Enforce a maximum PDF size in bytes, checked in R2 before loading, and a maximum page count. Process pages in batches.
- Any failure, limit breach, or empty text marks the PDF `failed`; the publication falls back to its abstract (REQ-DATA-006).
- Store the extractor name and version with the text.
- Evaluate only on openly licensed fixture PDFs (REQ-DATA-010): a large file, a scanned file, a two-column paper with equations, and a corrupt file.
- Keep a Cloudflare-hosted conversion as the fallback for PDFs that unpdf cannot parse. Adding it needs its own ADR, because it adds a service to the stack (REQ-NFR-002).

## Consequences

- Set the size and page limits from measured peak memory and CPU on the fixture PDFs, and record them in the configuration.
- Scanned PDFs are not read in the MVP.
- The byte cap, the page cap, and the failure path each get a test named after REQ-DATA-006.
