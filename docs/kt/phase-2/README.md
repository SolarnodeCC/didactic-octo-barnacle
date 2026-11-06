---
title: Phase 2 delivery plan
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-PROC-007]
---

# Phase 2 delivery plan: research understanding

How phase 2 of the [roadmap](../roadmap.md) is delivered: what it builds, how it is built, the design, the build order, and what it waits for. The requirements stay the source of truth; this plan refers to them by ID and does not restate them. Decisions this plan needs are ADRs 0053 to 0061 (and ADR 0049, which settles the provider) in [decisions](../decisions/README.md); all are accepted.

| File | Summary |
|---|---|
| [Solution](solution.md) | Outcome, scope, the 16 phase 2 requirements, what stays out, and the data flow |
| [Approach](approach.md) | Gate-first, model-free build, one work package per pull request, and how the exit criteria are shown |
| [Design](design.md) | Components per package, queues and message types, the model-call helper, search, triage admission, budget, retractions, and the thin slice |
| [Schema](schema.md) | Migrations 0009 and 0010, configuration keys, and bindings |
| [Build plan](build-plan.md) | Work packages WP0 to WP11 with requirements, outputs, tests, and exit evidence |
| [Dependencies](dependencies.md) | Gates and their owners, the order of the work packages, services, libraries, and cost limits |
