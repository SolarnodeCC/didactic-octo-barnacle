---
title: "0019: Carry an organization key on user-owned records from the start"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-018, REQ-DASH-005, REQ-ACC-002]
---

# 0019: Carry an organization key on user-owned records from the start

- Decision status: Accepted
- Date: 2026-10-29

## Context

The MVP serves invited users in one shared workspace (OQ-010). Organization profiles and separate data per organization come later (REQ-DASH-005). A user ID on every user-written record does not help a later move to several organizations, because users, reviews, statuses, invitations, and audit events would all need a new key and a backfill.

## Options considered

1. **One shared workspace, no tenant key.** The simplest schema. Adding tenancy later needs a migration across user-owned tables and every query.
2. **An organization key from the start, with one organization in the MVP.** Costs one column and one filter per user-owned table now. Avoids the migration and makes later isolation a configuration change plus checks.

## Decision

Option 2:

- An `organization` record exists. The MVP has one organization, created at deployment, and every user belongs to it.
- Users, invitations, sessions, audit events, score reviews, and opportunity status entries carry the organization ID. Queries on these tables filter by the organization of the signed-in user, through one shared data-access helper.
- Publications, candidates, agent outputs, opportunities, and scores are produced by the shared pipeline and have no organization key. They are visible to every organization (the shared research corpus).
- Roles stay per user. Cross-organization access, organization switching, and per-organization pipelines are not built in the MVP.

## Consequences

- REQ-NFR-018 states the rule and its tests.
- The data model gains the organization record.
- REQ-DASH-005 (organization profile) adds fields to the organization record instead of changing the keys.
- Every integration test of a user-owned table includes a second organization and asserts that no row leaks.
