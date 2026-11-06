---
title: Legal review brief (OQ-014)
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-06
related: [REQ-DATA-010, REQ-ACC-011, REQ-NFR-016]
---

# Legal review brief (OQ-014)

Written answers from a named legal contact close OQ-014. Phase 2 does not start without the answers marked **phase-2 gate** below; they were approved on 2026-11-06 (see [Answers](#answers)). Until the launch questions are answered, the platform stays abstract-first and stores only license-permitted PDFs (ADR 0014).

## Named contact

| Field | Value |
|---|---|
| Legal contact | through the project address `info@solarnode.cc`; the owner chose not to record a person's name (2026-11-06) |
| Date requested | 2026-10-29 |
| Date answered | 2026-11-06 for the phase-2 gate questions 1 to 5, as reported by `@SolarnodeCC`; launch questions 6 to 12 pending |

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
11. Ask Tavily for written confirmation that storing API Output as private evaluation fixtures, used only to test our own agents, is allowed. The Platform Terms (2026-05-04) and Acceptable Use Policy (2026-10-21) do not address storage, evaluation, or publication of Output (ADR 0039).
12. Ask Brave Search in writing for the right to store and evaluate results. Its terms (section 3(b)) forbid both by default.

## Answers

| Questions | Answer | Conditions |
|---|---|---|
| 1 to 5 (phase-2 gate) | Approved, reported by `@SolarnodeCC` on 2026-11-06 | None recorded |
| 6 to 12 (launch) | _pending_ | |

Under ADR 0049 the pipeline sends abstracts to Workers AI, not to OpenAI or Anthropic. Question 4 covers the Anthropic eval judge; model processing by Cloudflare falls under the Cloudflare agreement of question 8.

## Engineering constraints until the launch questions are signed

- No full-text widening beyond ADR 0014.
- No Semantic Scholar ingestion.
- Search result recordings stay in a private store with a manifest in the repository, and no result text is committed or published (ADR 0039).
- Search providers may be coded behind an interface; live calls in production wait for DPA answers on items 8 and the storage-of-snippets question in ADR 0022.
