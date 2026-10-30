---
title: "0028: Freeze migration 0001 at the phase 1 tables"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-NFR-020, REQ-DATA-009, REQ-DATA-011]
---

# 0028: Freeze migration 0001 at the phase 1 tables

- Decision status: Accepted
- Date: 2026-10-30

## Context

`0001_init.sql` held only the phase 1 ingestion tables, with a note that the other tables of the data model would be added to the same file before its first deploy. The staging database now exists and phase 1 needs to run on it and measure volume. Adding every later table to `0001` would keep staging empty until the whole schema is known, and an applied migration must never be edited (REQ-NFR-020).

## Options considered

1. **Keep growing `0001` until the first deploy.** Staging stays empty for as long as the schema is incomplete, which blocks the phase 1 measurements.
2. **Freeze `0001` and add later tables in new migrations.** Each phase adds its own numbered, expand-only migration.

## Decision

Option 2. `0001_init.sql` stays as the phase 1 ingestion subset. Tables for triage, embeddings, agents, scoring, accounts, and tenancy are added in new numbered migrations by the phase that needs them. Migrations 0001 to 0004 can be applied to staging.

## Consequences

- [schema migration 0001](../architecture/schema-migration-0001.md) lists tables per migration instead of promising them in one file.
- Every migration keeps the previous Worker version working (REQ-NFR-020 AC3).
- The `Staging database` workflow can apply the migrations with `apply` on.
