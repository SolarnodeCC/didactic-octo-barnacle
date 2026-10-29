---
title: "0014: Abstract-first content policy"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DATA-004, REQ-DATA-006, REQ-DATA-010]
---

# 0014: Abstract-first content policy

- Decision status: Accepted
- Date: 2026-10-29

## Context

Many arXiv PDFs grant arXiv a distribution license only, so they cannot be stored or shown. The legal review of source and model-provider terms (OQ-014) is not finished.

## Options considered

1. **Abstract-first; store and extract PDFs only with a recorded license that allows it.** Works now, without legal sign-off. Most arXiv papers are processed from the abstract.
2. **Process transiently and keep only derivatives.** More full-text coverage, but needs legal sign-off on model processing and quote display first.

## Decision

Option 1:

- The title and abstract, which the sources publish under CC0, are the standard agent input.
- A PDF is stored and its text extracted only when its license allows it (REQ-DATA-010). Otherwise the publication stays abstract-only, links to the source, and agents receive `InputMode: abstract`.
- Abstract-only input caps `Confidence` at 0.7 (contract conventions). The dashboard shows the input mode.
- Option 2 is revisited when OQ-014 has a written answer, in a new ADR.

## Consequences

- Phase 1 and phase 2 do not wait for the legal review. The review gates any widening of full-text use.
- Evidence quotes come from the abstract for most papers.
