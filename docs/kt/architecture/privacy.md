---
title: Privacy and data retention
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-29
related: [REQ-NFR-009, REQ-NFR-015, REQ-NFR-016, REQ-ACC-008, REQ-ACC-009, REQ-ACC-011]
---

# Privacy and data retention

The baseline for the EU launch. The default market is the EU, so the platform treats GDPR as binding. Legal wording of the terms and the privacy policy is written by the legal owner (OQ-014); this document is the engineering input to it.

## Personal data held

| Data | Subjects | Source | Lawful basis (to confirm with legal) |
|---|---|---|---|
| Author name, ORCID, affiliation | Paper authors | Public scholarly records (OpenAlex, arXiv) | Legitimate interest: showing provenance of a publication. Not used to profile people. |
| Name, email address, role | Users | The user, through an invitation | Contract: providing the service the user was invited to |
| Sign-in records, sessions, audit events | Users | The platform | Legitimate interest: security |
| Score reviews | Users | The user | Contract |

Model providers receive publication text and prompts, never user data (security). Resend receives email addresses to deliver invitations and sign-in links.

## Processors

| Processor | Purpose | Data | Needed before launch |
|---|---|---|---|
| Cloudflare | Hosting, storage, AI Gateway | all platform data | data processing agreement, location of storage |
| OpenAI / Anthropic (per configured model) | Model calls | publication text, prompts | data processing agreement, retention terms, no training on inputs |
| Resend | Email delivery | email address | data processing agreement |
| Web search provider (OQ-033) | Search for two agents | search queries built from publication topics | data processing agreement |

Transfers outside the EU rely on the standard contractual clauses or the processors' adequacy status; legal confirms this for each processor before launch.

## Notice to authors

Authors are not users. The notice is a public page, linked from the footer, that says what author data is stored, from which source, why, and how to ask for erasure. Individual notices are not sent (disproportionate effort); legal confirms this under GDPR Art. 14.

## Erasure

- **User**: account deletion in settings (REQ-ACC-008).
- **Author**: a request to the support contact. An admin removes the author record and affiliations; publications stay. The action is recorded in the audit log without the personal data (REQ-NFR-016).
- **Backups**: D1 Time Travel keeps history for a limited period. A restore applies the list of erasures made since the restore point before the database serves traffic (REQ-NFR-015). The longest time a deleted record can remain in a backup is stated in the privacy policy.

## Retention

| Data class | Retention |
|---|---|
| Raw source records | 12 months, then reduced to the normalized publication |
| Publications, candidates, agent outputs, scores | kept while the publication is kept; removed by deletion on request |
| Stored PDFs and extracted text | kept while the license allows; removed with the publication |
| Model call records | 12 months, then aggregated per day |
| Run reports | 12 months |
| Sign-in records and sessions | 6 months |
| Audit events | 6 months |
| Invitations | 30 days after acceptance, revocation, or expiry |
| Backups | the D1 Time Travel window |

A scheduled job applies these periods and writes a run report (REQ-NFR-015). The periods are proposals until legal confirms them.

## Data subject requests

Access and portability requests from users are served by an admin export of the user's name, email, role, sign-in records, and reviews. Requests from authors are handled as erasure or as a copy of the author record. The support contact receives and answers both within one month.
