---
title: "0118: The throughput load test runs the real consumers on a virtual clock, and extraction is paced"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-NFR-010, REQ-PROC-005, REQ-PROC-004, REQ-AGENT-012]
---

# 0118: The throughput load test runs the real consumers on a virtual clock, and extraction is paced

- Decision status: Accepted
- Date: 2026-11-24
- Changes: how REQ-NFR-010 is verified (WP11 of the [phase 2 build plan](../phase-2/build-plan.md)), and how extraction messages are sent ([phase 2 design](../phase-2/design.md#throughput))

## Context

REQ-NFR-010 asks for a load test on recorded fixtures with stubbed models:
- **AC1:** a day's ingestion and triage finish before the next scheduled run.
- **AC2:** the daily triaged number completes triage and extraction within 24 hours.

The in-memory queue of the tests delivers serially and has no time, and the fake model answers at once, so neither can show a duration. The design estimated triage at four hours. That estimate assumed 20 requests a minute for every model, but the triage model (Gemma, thinking off) has the default limit of 300. "The next scheduled run" can mean the 11:00 admission run or the next day's 06:00 ingestion.

## Options considered

1. **A separate queueing model.** It is fast, but it checks the model, not the code.
2. **The real consumers, on a virtual clock.** Chosen by the owner on 2026-11-24.

## Decision

- **Harness.** `pnpm --filter @roi/pipeline load` (`apps/pipeline/src/load/`) runs a generated day through the real ingestion, triage, embedding, admission, and extraction consumers.
  - **Corpus.** It has 4,634 publications by default, the largest measured day, split 4,090 OpenAlex and 544 arXiv. The corpus is generated, not committed (test data).
  - **Clock.** Everything that takes time waits on a discrete-event clock: queue delays, model latency, retries, and source pages. A day runs in seconds.
- **Queues.** Each queue has the batch size, concurrency, and retries of `wrangler.toml`, and Cloudflare's default batch timeout of 5 s.
- **Models.** Latency is drawn between the benchmark's p50 and p95, from a seeded generator, so a run repeats exactly:
  - triage: 3.0 to 5.9 s;
  - extraction: 11.7 to 31.9 s;
  - embedding: 0.5 to 1.5 s, an assumption, because embedding latency was not benchmarked.

  Requests are limited per minute: 300 for triage and embedding, 20 for the paid extraction model. A call over the limit gets a 429 with `Retry-After`.
- **Sources.** An OpenAlex page takes 2 s and an arXiv page 3 s.
- **Schedule.** The day's crons run at their times: OpenAlex at 06:00, arXiv at 07:30, admission at 11:00, and the recovery check every 30 minutes.
- **Verdicts.** AC1 is checked both ways, and the strict reading is the pass mark: every publication is triaged before the 11:00 admission run. AC2: the admitted daily limit is extracted within 24 hours of 06:00. Nothing may be dead-lettered.
- **Pacing.** The first run showed that the model queue's concurrency of 8, at about 22 s per extraction, sends about 22 requests a minute to a model that allows 20.
  - 8 of the 100 admitted extractions used up their attempts on 429s and waited for the next day's re-drive, past 24 hours.
  - **The fix:** extraction messages are sent spaced to `model.extraction_requests_per_minute` (20), that is 3 s apart. The admission cron queues the re-driven extractions first and the admitted ones after them. `callModel` and its attempt limit do not change.
- **CI.** It runs the full day in the integration tests (about 7 s). It also runs a 300-publication day without pacing, to show that the test catches the problem.

## Consequences

- At the largest measured day:
  - ingestion ends at 07:31, when the arXiv run finishes;
  - every publication is triaged and embedded by 07:35;
  - the 100 admitted publications are extracted by 11:06;
  - no item is re-driven and nothing is dead-lettered.
- Paced at exactly 20 a minute, about a third of extraction calls still get a 429, which a retry absorbs. If the staging days show re-drives from 429s, the key is lowered.
- The model figures are benchmark figures, not measurements under load. REQ-NFR-010 is `done` only after the staging days confirm the times; REQ-AGENT-012 measures concurrency in phase 3.
