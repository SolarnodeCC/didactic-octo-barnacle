---
title: "0063: Automatic recovery without an admin"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-07
related: [REQ-PROC-010, REQ-DATA-012, REQ-AGENT-016, REQ-ADM-002, REQ-AGENT-009, REQ-DATA-011, REQ-NFR-005]
---

# 0063: Automatic recovery without an admin

- Decision status: Accepted
- Date: 2026-11-07
- Answers: none
- Changes: new REQ-PROC-010, REQ-DATA-012, and REQ-AGENT-016; the description of REQ-ADM-002; REQ-NFR-019 AC1 (the `step-paused` alert); [orchestration](../architecture/orchestration.md), the dead-letter row of [defaults](../architecture/defaults.md), and the phase 2 [design](../phase-2/design.md) and [schema](../phase-2/schema.md)

## Context

The platform is meant to run end to end without manual steps ([overview](../overview.md)), and every runtime decision is already made by code or by a model under a fixed contract: "The pipeline has no review step" ([orchestration](../architecture/orchestration.md)). Recovery is the exception. A review of the agent chain on 2026-11-07 found three places where work stops until a person acts:

- A failed or incomplete candidate is rerun only by an admin (REQ-ADM-002). A provider outage of one afternoon leaves every candidate of that afternoon incomplete and unscored until someone reruns it.
- A dead-lettered message is replayed only by the replay function or the admin route (REQ-DATA-011 AC4). In phase 1 a dead letter also closes its run as `failed`.
- After the daily budget stop, `callModel` refuses new steps with `budget-exhausted`. Triage and embedding messages are queued again by the admission cron ([0055](0055-daily-admission-and-budget-stop.md)), but a refused `publication.extract` and a phase 3 `candidate.run` that never started have no defined next step.

`callModel` already tells the failures apart. It returns `provider-error` when the provider failed through all attempts, `invalid-output` when the model's answer stayed invalid, and `budget-exhausted` when the step was refused before its first call.

## Options considered

1. **Automatic re-drive with limits, admin rerun kept as an option.** Chosen.
2. **Keep recovery manual** and rely on alerts. Every outage then needs a person, and the backlog grows on days nobody looks.
3. **Retry without limits.** A model that is retired (REQ-AGENT-014 AC4) or a prompt that always fails would spend the budget on the same items every day.

## Decision

- **Failure classes.** A step that ends without a stored result is classed by its last outcome:
  - *transient*: `provider-error`, `budget-exhausted`, or a message that went to the dead-letter queue;
  - *content*: `invalid-output`, including a quote that fails the check of [0064](0064-quote-check-after-normalisation.md).
- **Re-drive.** The daily admission cron ([0055](0055-daily-admission-and-budget-stop.md)) re-drives failed work after the retraction sweep and before it admits new publications. A re-drive starts at the first failed step and reuses the stored output of every completed step, the same mechanism as REQ-ADM-002 AC1.
  - A transient failure is re-driven at most once a day, up to `recovery.max_redrives` (3) times.
  - A content failure is re-driven once, the next day. After that it is re-driven again only when the step's model or prompt version has changed since its last attempt, because the same model on the same prompt is likely to fail the same way.
  - When the limit is used up, the item is marked `failed-final`. It stays incomplete and unscored (REQ-SCORE-005) and is listed in the run report (REQ-NFR-008). No alert is sent per item.
- **Budget.** Re-driven extractions count toward `ingestion.daily_extraction_limit`, and at most `recovery.max_redrives_per_day` (20) items are re-driven a day. Re-drives therefore fit inside the budget formula of [0059](0059-phase-2-budget-by-cost-component.md), which does not change. A step refused with `budget-exhausted` completes as `budget-deferred` and is picked up by the next day's cron; this covers `publication.extract` in phase 2 and `candidate.run` in phase 3.
- **Dead letters.** A dead-lettered message is replayed automatically after `recovery.dead_letter_replay_hours` (6), at most twice per message ID. The replay uses the existing replay function, so it creates no duplicates (REQ-DATA-011 AC4). The `dead-letter` alert stays.
- **Circuit breaker.** When more than `recovery.breaker_failure_share` (0.5) of a step's calls in the last hour end in `provider-error`, the step pauses. Its consumer completes new messages as `budget-deferred` without a model call, one `step-paused` alert is sent, and a single probe call every 30 minutes resumes the step when it succeeds. Items that wait during a pause do not use up re-drives. This keeps a provider outage or a retired model from spending every item's re-drives in one day.
- **Idempotency.** A re-drive never creates a second result. Extraction is not repeated when an `extraction_result` already exists for the publication, and a candidate step is not repeated when its output is stored (REQ-DATA-011 AC1).
- **Admin rerun stays.** REQ-ADM-002 remains as an optional action, for example after a prompt fix, and it is no longer the only way to recover.
- **State.** Re-drive counts are kept in a `redrive` table (`item_kind`, `item_id`, `step`, `failure_class`, `count`, `last_attempt_at`, `last_model`, `last_prompt_version`, `final`), added in the migration of the work package that first re-drives.

## Consequences

- No item waits on a person. An outage costs a day of delay instead of a manual backlog, and the breaker keeps it from costing the re-drive budget.
- An item can still end `failed-final`. The run report lists those items, and the quality monitor of the run report shows a rising failure rate.
- REQ-PROC-010 covers phase 2 (triage, embedding, extraction), REQ-DATA-012 covers dead-letter replay, and REQ-AGENT-016 covers phase 3 candidate runs.
- The new configuration keys are listed in the phase 2 [schema](../phase-2/schema.md) and move to [defaults](../architecture/defaults.md) in the pull request that first reads them.
