---
title: "0065: Extraction waits for full text at admission"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-PROC-011, REQ-PROC-008, REQ-DATA-006, REQ-DATA-004]
---

# 0065: Extraction waits for full text at admission

- Decision status: Proposed
- Date: 2026-11-07
- Answers: none
- Changes: new REQ-PROC-011; the phase 2 [solution](../phase-2/solution.md), [design](../phase-2/design.md), and [schema](../phase-2/schema.md)

## Context

Extraction reads the full text when it is available and the abstract otherwise (REQ-DATA-006 AC3, ADR 0014). With the abstract only, `Confidence` is capped at 0.7, and a candidate can only be quoted from a few sentences. Full text holds more of the evidence that extraction needs: the named customer, the trigger, and the current alternative are often in the introduction or the discussion, not in the abstract.

The phase 2 design says extraction "reads the full text when the text consumer has stored it by then" ([solution](../phase-2/solution.md)). That is a race. A publication is triaged as soon as it is stored, while its PDF is fetched on the document queue and its text extracted on the text queue, each with its own retries. When the admission cron runs before the text consumer has finished, the publication is extracted from its abstract, and it is never extracted again, because `extraction_result` is unique per publication. Which input a publication gets then depends on queue timing, not on what is available.

## Options considered

1. **The admission cron admits a publication only when its document state is final, with a time limit.** Chosen.
2. **Delay the extraction message** by a fixed time. Rejected: a fixed delay is either too short for a retried PDF or wastes a day for publications without one, and it makes the order of the daily limit depend on timing.
3. **Extract twice**, first from the abstract and again when full text arrives. Rejected: it doubles the extraction cost of ADR 0059 and creates two candidate sets to reconcile.

## Decision

- A passing publication is **ready** for admission when its document state is final:
  - its text is stored (`text-extracted`);
  - text extraction failed (`text-failed`);
  - it has no PDF URL with a license that allows storage (REQ-DATA-010); or
  - its `document.ingest` message has finished without a stored document.
- The admission cron ranks all passing publications as before (REQ-PROC-008 AC4), and admits only ready ones in that order. A publication that is not ready keeps its place in the pool and is considered the next day.
- After `extraction.full_text_wait_hours` (24) since its triage decision, a publication is ready whatever its document state, and it is extracted from the abstract.
- The ranking does not change, so the same input still gives the same order. Readiness only decides whether a ranked publication is admitted today or later.

## Consequences

- A publication with a usable PDF is extracted from its full text unless the text takes longer than the wait. Publications without a PDF are admitted as before.
- Most publications with a PDF wait at most one admission cycle, because the PDF and text queues usually finish within hours.
- The run report counts publications that went in on the abstract because the wait ran out, so a slow text queue is visible.
- The 24,000-character cut of `extraction.full_text_max_chars` is not changed. The eval report of [0067](0067-eval-metrics-and-calibration.md) records where accepted quotes fall in the text, to show whether the cut loses evidence.
