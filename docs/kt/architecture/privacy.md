---
title: Privacy and data retention
owner: "@SolarnodeCC"
status: approved
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

### Legitimate interest of the author data (engineering input for legal)

- **Purpose:** show where an opportunity comes from, so a reader can judge and trace its source publication.
- **Necessity:** the name and affiliation identify the source work; the ORCID tells two authors with the same name apart. Nothing else about the person is stored.
- **Balance:** the data is already public in scholarly records; authors expect it to be cited. It is never shown outside provenance, never used to score, rank, or profile a person (REQ-NFR-016 AC3), and never sent to a model provider as a person-level record.
- **Safeguards:** an author can ask for erasure at any time (below); an erased author is not stored again.

Legal confirms or replaces this assessment (OQ-014). Until then the lawful basis in the table above stays "to confirm with legal".

## Notice to authors

Authors are not users. The notice is a public page, linked from the footer, that says what author data is stored, from which source, why, and how to ask for erasure. Individual notices are not sent (disproportionate effort); legal confirms this under GDPR Art. 14.

## Erasure

- **User**: account deletion in settings (REQ-ACC-008).
- **Author**: a request to the support contact. An admin finds the stored author records (an ORCID identifies one author; an arXiv author has one record per paper and is found by exact name) and erases each of them (`eraseAuthor`; the route `POST /admin/authors/:id/erase` comes with the admin API in phase 4). Erasure removes the author record and every affiliation. The publications stay. It also clears the title-and-first-author key of the author's publications, which holds the first author's normalized name. The reason is a code (`author-request`, `legal-order`, `ingested-in-error`), never free text.
- **Not stored again:** the next ingestion would fetch the same work and store the author again, so an erased author is put on an erasure list. The list holds an HMAC-SHA256 of the stored author ID, keyed with the Worker secret `ERASURE_HASH_KEY`, and a reason code: no name, ORCID, or affiliation. Ingestion skips listed authors. Without the key, ingestion stops instead of storing an author (ADR 0031).
- **Audit:** an audit event `author.erased` with an opaque actor, the erasure ID, the reason code, and counts. It holds no personal data (REQ-NFR-016 AC2).
- **What erasure does not change:** the text of publications (titles, abstracts, stored PDFs) can contain the author's name. Publications are removed separately, on request or when ingested by mistake (data model, deletion).
- **Backups**: D1 Time Travel keeps history for a limited period. A restore applies the list of erasures made since the restore point before the database serves traffic (REQ-NFR-015). The erasure list is also kept in the document bucket (`erasures/<hash>.json`), which a database restore does not touch, and `reapplyErasures` puts the entries back and removes any listed author the restored data brought back. The longest time a deleted record can remain in a backup is stated in the privacy policy.

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

Access and portability requests from users are served by an admin through `GET /admin/dsar/:userId` (ADR 0025, [api routes](api-routes.md)), which returns the user's name, email, role, sign-in records, and reviews as JSON. Requests from authors are handled as erasure (`POST /admin/authors/:id/erase`) or as a copy of the author record. The support contact receives and answers both within one month.
