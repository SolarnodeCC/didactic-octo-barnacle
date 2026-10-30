---
title: Privacy requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
---

# Privacy requirements

Personal data, data retention, and author data. The privacy baseline is in [privacy](../../architecture/privacy.md).

### REQ-NFR-009: Personal data

The platform processes as little personal data as possible.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: KT review of data protection
- Acceptance criteria:
  1. Only public author metadata from the sources is stored: name, source identifiers such as ORCID, and affiliation.
  2. User data is limited to the name and email address that accounts need (REQ-ACC-003), sign-in records, roles (REQ-NFR-012), score reviews (REQ-SCORE-007), and REQ-DASH-004.
  3. The processing of personal data is described in the security document.
- Verification: code review

### REQ-NFR-015: Data retention

Every class of stored data has a retention period, and deletion covers backups.

- Phase: 4
- Priority: must
- Status: planned
- Source: Readiness assessment; OQ-030; [privacy](../../architecture/privacy.md)
- Depends on: REQ-NFR-009
- Acceptance criteria:
  1. The [privacy](../../architecture/privacy.md) document lists a retention period for model call records, run reports, raw source records, stored PDFs and text, sign-in records, audit events, and backups.
  2. A scheduled job deletes records that are past their period, and the job reports counts in a run report (REQ-NFR-008).
  3. A deletion or erasure request is also applied to restored backups before they serve traffic, and the privacy policy states the longest time a deleted record can remain in a backup.
- Verification: integration test of the retention job and review of the privacy document

### REQ-NFR-016: Author personal data

The platform has a documented lawful basis and an erasure process for the author data it stores.

- Phase: 1
- Priority: must
- Status: in-progress
- Source: Readiness assessment (GDPR); REQ-NFR-009
- Acceptance criteria:
  1. The [privacy](../../architecture/privacy.md) document states the lawful basis for storing author names, ORCIDs, and affiliations, and how the notice to authors is given.
  2. A request from an author to erase their data removes the author record and their affiliations from the platform, keeps the publications, is recorded in the audit log without the personal data, and the author is not stored again by a later ingestion.
  3. Author data is never shown outside provenance and is never used to profile people.
- Verification: integration test of author erasure and review of the privacy document
