---
title: Low-fidelity wireframes
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DASH-001, REQ-DASH-002, REQ-DASH-004, REQ-DASH-007, REQ-DASH-010, REQ-DASH-011, REQ-ACC-003, REQ-ACC-004]
---

# Low-fidelity wireframes

Layout only. Visual tokens are in ADR 0024. All text shown from models is plain text (REQ-NFR-013).

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
│ Search [describe a problem or technology______] [ Search ]         │
│ Filters: Industry [All ▾] Band [All ▾] Date [from–to]                │
│          Review [All ▾] Status [All ▾]                               │
│ Score Band Title/startup Industry Published Review Status            │
│  71   High AI Focus Planner enterprise 2026-09-15 unreviewed —       │
│  ...                                                                  │
│ [ Previous ]                                          [ Next ]        │
└──────────────────────────────────────────────────────────────────────┘
```

## Opportunity detail

```text
┌ AI Focus Planner ──────────────────────────────────────────────────┐
│ Score 71  High   Evidence-backed   [Estimate-based] [Abstract]       │
│ Review: unreviewed   [ Confirm ] [ Dispute ]   (analyst, admin)      │
│ Status: none   [ Pursued ] [ Parked ] [ Rejected ] note [____]       │
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
│ Review history · Status history                                      │
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

## Check your email / Link problem

```text
┌ Check your email ─────────────┐  ┌ Link problem ──────────────────┐
│ If an account exists for that │  │ This link expired or was used. │
│ address, a link is on the way.│  │ [ Request a new link ]         │
│ [ Resend ] (after 60s)        │  │ No hint whether the email is   │
└───────────────────────────────┘  │ registered.                    │
                                   └────────────────────────────────┘
```

## Trends / Account settings / Usage

```text
┌ Trends ───────────────────────┐  ┌ Settings ──────────────────────┐
│ Range [last 12 months ▾]      │  │ Name [____________] [ Save ]   │
│ Opportunities / industry      │  │ Email (read-only)  Role viewer │
│ Publications / topic (top 20) │  │ Recent sign-ins …              │
└───────────────────────────────┘  │ [ End other sessions ]         │
                                   │ [ Delete account ]             │
                                   └────────────────────────────────┘

┌ Usage and cost ───────────────────────────────────────────────────┐
│ Range [this month ▾]  Spent EUR 412 / budget EUR 800               │
│ By day · By step · By agent   (estimates labeled)                  │
└────────────────────────────────────────────────────────────────────┘
```

## Invitations / Users / Audit

```text
┌ Invitations ──────────────────┐  ┌ Users ─────────────────────────┐
│ Email [____] Role [viewer ▾]  │  │ Name  Email  Role  Status       │
│ [ Invite ]                    │  │ …     …      [admin ▾] Active  │
│ pending · sent · revoked      │  │ [ Deactivate ] (not last admin)│
└───────────────────────────────┘  └────────────────────────────────┘

┌ Audit log ────────────────────────────────────────────────────────┐
│ Filter action [All ▾]                                              │
│ Time  Actor  Action  Target                                        │
└────────────────────────────────────────────────────────────────────┘
```

## Brief / Legal / System

```text
┌ Brief (print) ────────────────┐  ┌ Terms / Privacy / Support ─────┐
│ Title, score, band, categories│  │ Version · date · body           │
│ concept, next steps, source   │  │ Support: email contact          │
│ (print stylesheet)            │  └────────────────────────────────┘
└───────────────────────────────┘
┌ Not found / Session expired / Error ──────────────────────────────┐
│ Plain message · [ Sign in ] or [ Home ] · referenceId when error   │
└────────────────────────────────────────────────────────────────────┘
```
