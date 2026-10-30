---
title: "0024: Dashboard design system foundation"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DASH-001, REQ-DASH-006, REQ-NFR-013]
---

# 0024: Dashboard design system foundation

- Decision status: Accepted
- Date: 2026-10-29

## Context

UX screens and wireframes describe structure but not visual tokens. Without a minimum design system, parallel frontend work invents conflicting patterns and risks failing accessibility (REQ-DASH-006).

## Options considered

1. **No system until first UI PR.** Fast start; high rework.
2. **Minimum tokens and component list in KT**, implemented with Tailwind CSS utility classes and a small set of shared React primitives in `apps/dashboard`.

## Decision

Option 2. The dashboard uses:

| Token | Value |
|---|---|
| Font sans | `"Source Sans 3", "Segoe UI", sans-serif` |
| Font display | `"Source Serif 4", Georgia, serif` |
| Color bg | `#f7f5f2` |
| Color ink | `#1a1a1a` |
| Color muted | `#5c5c5c` |
| Color accent | `#0b6e4f` |
| Color border | `#d9d4cc` |
| Color band-low | `#6b7280` |
| Color band-medium | `#2563eb` |
| Color band-high | `#0b6e4f` |
| Color band-exceptional | `#9a3412` |
| Radius | `4px` |
| Space unit | `4px` |

Bands always show text labels; color is secondary (REQ-DASH-006). Shared primitives: `Page`, `DataTable`, `FilterBar`, `ScoreBadge`, `EmptyState`, `ErrorState`, `ConfirmDialog`. Charts use a single library chosen in the first trends PR (prefer a dependency that supports keyboard focus on points). No card wrappers in the hero/home summary; tables and forms are the interaction containers.

## Consequences

- [ux](../ux/README.md) references this ADR for visual decisions.
- CSP may keep `style-src 'unsafe-inline'` only until Tailwind extraction removes the need (see [security](../architecture/security.md)).
