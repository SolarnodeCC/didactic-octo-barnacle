---
title: Low-fidelity wireframes
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-DASH-001, REQ-DASH-002, REQ-DASH-007, REQ-DASH-010, REQ-DASH-011, REQ-ACC-003, REQ-ACC-004]
---

# Low-fidelity wireframes

Layout only. Wording, spacing, and visual design are decided with the first dashboard code. All text shown from models is plain text (REQ-NFR-013).

## Sign in and Continue

```text
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Sign in                      │   │ Continue                     │
│ Email  [__________________]  │   │ Press Continue to sign in.   │
│ [ Send link ]                │   │ [ Continue ]                 │
│ No account? Access is by     │   │                              │
│ invitation only.             │   │                              │
└──────────────────────────────┘   └──────────────────────────────┘
```

## Create account

```text
┌──────────────────────────────┐
│ Welcome                      │
│ Email  anna@example.org (ro) │
│ Name   [__________________]  │
│ [x] I accept the terms and   │
│     the privacy policy       │
│ [ Create account ]           │
└──────────────────────────────┘
```

## Home

```text
┌ Home ─────────────────────────────────────────────────────────────┐
│ New since your last visit: 12   High or Exceptional: 3   Total: 148 │
│ Data updated 2026-10-29 06:10 UTC                                   │
│ Top opportunities                                                   │
│  1  AI Focus Planner         71  High         enterprise            │
│  2  ...                                                             │
└────────────────────────────────────────────────────────────────────┘
```

## Opportunities

```text
┌ Opportunities ───────────────────────────────────────────────────┐
│ Filters: Industry [All ▾] Band [All ▾] Date [from – to] Review [All ▾] │
│ Score  Band  Title / startup          Industry   Published  Review    │
│  71    High  AI Focus Planner         enterprise 2026-09-15 unreviewed│
│  ...                                                                  │
│ [ Previous ]                                          [ Next ]        │
└──────────────────────────────────────────────────────────────────────┘
```

## Opportunity detail

```text
┌ AI Focus Planner ──────────────────────────────────────────────────┐
│ Score 71  High   [Estimate-based] [Based on the abstract]            │
│ Review: unreviewed   [ Confirm ] [ Dispute ]   (analyst, admin)      │
│ [ Export brief ]                                                     │
├ Categories ─────────────────────────────────────────────────────────┤
│ Scientific Novelty    60  ▸ why, evidence                            │
│ Market Potential      76  ▸ why, evidence, "Estimate"                │
│ Competitive Gap       50  ▸ why, competitors ("Unverified")          │
│ Technical Feasibility 80  ▸ why                                      │
│ Strategic Relevance   90  ▸ why                                      │
├ Concept and business case ──────────────────────────────────────────┤
│ Value proposition, pricing, MVP features, next steps, risks          │
├ Source publication ─────────────────────────────────────────────────┤
│ Title, authors, date, link to the source                             │
├ Agent outputs (model, prompt version) ▸ ────────────────────────────┤
│ Review history: user, date, state, reason                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Priority matrix

```text
┌ Priority matrix ─────────────────────────────────────────────────┐
│ Market Potential ▲                                                │
│  60 ┤ Monitor (4)        │ Pursue now (9)                          │
│     │                    │   ● ● ◆                                 │
│     ├────────────────────┼──────────────────────                   │
│     │ Quick win (…)      │ Needs technology (…)                    │
│     └────────────────────┴──────────────────────▶ Technical Feas.  │
│                       60                                           │
│ Table: Title | Quadrant | Score | Band | Market | Feasibility        │
└──────────────────────────────────────────────────────────────────┘
```

Point shapes show the band in addition to color (REQ-DASH-010).

## Opportunity operations (admin)

```text
┌ Operations ─────────────────────────────────────────────────────┐
│ Find  [title or ID________] [ Search ]                            │
│ AI Focus Planner   status: complete   [ Hide ] [ Rerun ]          │
│ Score model: active v1   [ Change active ▾ ]  [ Start rescore ]   │
│ Hide reason [______________________________] (required)           │
└──────────────────────────────────────────────────────────────────┘
```

## Pipeline health (admin)

```text
┌ Pipeline health ────────────────────────────────────────────────┐
│ Source     Last run          New  Failed  Dead-lettered           │
│ OpenAlex   2026-10-29 05:00   87     2        0                  │
│ arXiv      2026-10-29 06:00   41     0        0                  │
│ Incomplete opportunities: 5   Budget stops: none this week        │
│ Failed candidates: cand-… step Competition   [ Rerun ]            │
└──────────────────────────────────────────────────────────────────┘
```
