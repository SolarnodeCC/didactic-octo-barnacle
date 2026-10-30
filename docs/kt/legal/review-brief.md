---
title: Legal review brief (OQ-014)
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-DATA-010, REQ-ACC-011, REQ-NFR-016]
---

# Legal review brief (OQ-014)

Written answers from a named legal contact close OQ-014. Until then, phase 1 stays abstract-first and stores only license-permitted PDFs (ADR 0014). Phase 2 does not start without the answers marked **phase-2 gate** below.

## Named contact

| Field | Value |
|---|---|
| Legal contact name | _to be named by `@SolarnodeCC`_ |
| Contact email | _to be named_ |
| Date requested | 2026-10-29 |
| Date answered | _pending_ |

## Phase-2 gate questions

Answer yes/no with conditions for each:

1. May the platform commercially use OpenAlex metadata and abstracts under the OpenAlex terms current at the answer date?
2. May the platform commercially use arXiv metadata and abstracts under arXiv terms?
3. For PDFs whose license allows redistribution, may we store, extract text, and show quotes up to 500 characters in the product?
4. May we send publication abstracts (and, where licensed, extracted full text) to OpenAI and Anthropic through Cloudflare AI Gateway for analysis, with no training on our inputs?
5. Is legitimate interest an acceptable lawful basis for storing public author name, ORCID, and affiliation for provenance, with a public Art. 14 notice and erasure on request?

## Launch questions (before production)

6. Draft or approve terms of use, privacy policy, author notice, and support contact text (REQ-ACC-011).
7. Confirm retention periods in [privacy](../architecture/privacy.md).
8. Confirm DPAs (or equivalent) for Cloudflare, OpenAI, Anthropic, Resend, Brave Search, and Tavily.
9. Confirm whether transient processing of non-redistributable full text (without storage) is allowed; if no, keep abstract-first permanently for those works.
10. Confirm Semantic Scholar commercial use if REQ-DATA-003 is scheduled.

## Engineering constraints until signed

- No full-text widening beyond ADR 0014.
- No Semantic Scholar ingestion.
- Search providers may be coded behind an interface; live calls in production wait for DPA answers on items 8 and the storage-of-snippets question in ADR 0022.
