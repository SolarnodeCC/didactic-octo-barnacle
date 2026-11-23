---
title: "0115: The daily quality section: metrics, stored values, and the drift rule as built"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-23
related: [REQ-NFR-023, REQ-NFR-019]
---

# 0115: The daily quality section: metrics, stored values, and the drift rule as built

- Decision status: Accepted
- Date: 2026-11-23
- Changes: how the quality monitoring of [ADR 0071](0071-automatic-quality-monitoring-from-run-signals.md) is computed and stored ([phase 2 design](../phase-2/design.md#quality-section))

## Context

ADR 0071 lists what the daily quality section shows and when a drift alerts, but not how each rate is named, counted, and kept for its baseline. Two of its inputs are not in the stored rows: where accepted quotes fall in the input, which needs the text the step sent, and the earlier days' values, which need somewhere to live. ADR 0071 also does not say what a relative move from a median of zero means.

## Options considered

1. **Recompute each rate for the 14 previous days at every report.** This needs no new table, but every report reads two weeks of rows, and an old value changes when a late row arrives.
2. **Store each day's rates, and store quote positions at extraction time.** Chosen.

## Decision

- **Rates.** Each rate has a name, a value, and the items behind it. A rate with no items that day is left out.
  - Triage rates count model decisions only, not rule rejections: `triage.accept_rate` and `triage.signal.<signal>`.
  - Extraction rates count the run's `extraction_result` rows: `extraction.empty_share`, `extraction.candidates_per_publication`, and `extraction.abstract_only_share`.
  - Per model step: `<step>.first_attempt_valid` is first attempts that ended `ok`, over first attempts, and `<step>.repair_rate` is later attempts that ended `ok`, over first attempts.
  - `extraction.drop_rate` and `extraction.quote_drop_rate` come from the run counts `CandidatesDropped` and `DroppedQuote`, over the candidates stored plus dropped.
  - The report-only check of ADR 0066 is `extraction.customer_quote_no_overlap`.
  - Agreement: `agreement.accepted_without_candidate`, `agreement.trigger_with_why_now`, and `agreement.existing_alternative_with_quote`.
- **Report only.** The `Confidence` histogram, the quote positions, the counts per industry (from the topic map of the publication's topics), and the near-duplicate count are reported, never alerted on.
- **Stored values.**
  - `quality_metric (day, metric, value, items)` holds each day's rates (migration 0013).
  - `extraction_result.quote_positions_json` holds ten counts: the kept quotes by the tenth of the sent text they start in, computed by the extraction step.
  - Both hold counts and rates only.
- **Drift.** A rate drifts when its relative move from the median of the previous `monitor.baseline_days` exceeds `monitor.drift_band` on at least `monitor.min_daily_items` items. A median of 0 is reported and never alerts. Start-up lasts until `monitor.baseline_days` after the first `daily` processing run.
- **Near-duplicates.** The candidates' publications are looked up in the current index (at most 100 a day, ten neighbours each), using stored vectors only.
- **When.** The section is computed when the admission cron reports the previous day's `daily` run (ADR 0114), and drift alerts are sent then.

## Consequences

- Each report adds a few D1 queries and up to 200 Vectorize reads, and no model call.
- A metric added later starts with no baseline and cannot alert for its first day.
- The bands stay first guesses; the stored values make tuning them from the first weeks a query, not a backfill.
