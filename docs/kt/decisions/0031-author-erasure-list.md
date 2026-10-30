---
title: "0031: Author erasure keeps a keyed-hash list"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-NFR-016, REQ-NFR-015, REQ-NFR-009]
---

# 0031: Author erasure keeps a keyed-hash list

- Decision status: Accepted
- Date: 2026-10-30

## Context

REQ-NFR-016 asks that an author who asks for erasure is removed from the platform and that the action is logged without personal data. Ingestion fetches recent works again every day (the overlap window), so a plain deletion is undone by the next run: the same work brings the same author back. Remembering who was erased needs some data, and that data must not become a new store of the same personal information.

## Options considered

1. **Delete only.** Simple, but the author returns at the next ingestion.
2. **Keep the erased ID in a list.** Works, but the list then holds an ORCID or an OpenAlex ID, which identifies the person.
3. **Keep a plain hash of the ID.** Smaller risk, but an ORCID is public and guessable, so anyone can test a name against the list.
4. **Keep a keyed hash (HMAC-SHA256 with a Worker secret).** The list shows nothing without the key, and ingestion can still check a candidate author against it.

## Decision

Option 4. An erased author's stored ID is hashed with `ERASURE_HASH_KEY`; the hash and a reason code form the list, in the database (`author_erasure`) and, for restores, in the document bucket (`erasures/<hash>.json`). Ingestion skips listed authors and never uses an erased first author's name for matching. Without a usable key ingestion stops, because continuing could store an erased author. The reason is a code, not free text. The audit event holds the erasure ID, the reason code, and counts.

## Consequences

- The key is a secret to keep: losing or changing it makes the list unusable, and every erased author would return. Operations lists it with the other secrets.
- An OpenAlex author with an ORCID is stored under the ORCID, one without under the OpenAlex ID. If OpenAlex later adds an ORCID to an author erased by OpenAlex ID, the stored ID changes and the list does not match. Erasure by name and ORCID (`findAuthorIds`) covers both while the record exists; a stored source ID per author would close the gap and is a follow-up.
- An arXiv author has no identifier, so each paper has its own author record. A person is erased paper by paper, found by exact name.
- The route `POST /admin/authors/:id/erase` and the public notice page come with the admin API and the dashboard in phase 4; the launch checklist requires them.
