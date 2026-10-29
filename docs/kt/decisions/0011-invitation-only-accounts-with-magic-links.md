---
title: "0011: Invitation-only accounts with magic links sent through Resend"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-007, REQ-NFR-009, REQ-NFR-012, REQ-ACC-001, REQ-ACC-002, REQ-ACC-003, REQ-ACC-004]
---

# 0011: Invitation-only accounts with magic links sent through Resend

- Decision status: Accepted
- Date: 2026-10-29

## Context

The platform will be available online, so people outside the team need accounts. ADR 0004 proposed Cloudflare Access for one internal team and said the platform stores no passwords. The team now wants public access with these rules: no sign-in through Google or GitHub, sign-in links sent through Resend, and accounts created by invitation only.

Each opportunity costs model spend and the source licenses limit redistribution (REQ-DATA-010), so open registration is not acceptable.

## Options considered

1. **Cloudflare Access with an email allowlist.** No code, no passwords. It has no invitation flow, no profile, no roles inside the application, and no way for an administrator to invite people from the dashboard.
2. **A managed identity provider (for example Clerk or Auth0).** Fast to build, but adds an external processor of user data, and the team chose Resend for email.
3. **Invitations and magic links implemented in the platform on Workers and D1, with Resend for email.** The platform owns the flow, the data stays in Cloudflare except the email address sent to Resend, and no passwords exist. The platform carries the security work.

## Decision

Option 3:

- An administrator creates an invitation. Resend sends the invitation email with a link that holds a random token (REQ-ACC-002).
- Opening the link verifies the email address and signs the person in. A person without an account sees the create-account screen, where they enter a name and accept the terms. Submitting it creates the user and consumes the invitation (REQ-ACC-003).
- Later sign-ins use a one-time link sent to the account email, with the same response for known and unknown addresses (REQ-ACC-004).
- Tokens are random, single purpose, short-lived, and stored only as hashes. Sessions are cookies that the dashboard and the API both accept. The dashboard and the API refuse requests without a session (REQ-NFR-007).
- There is no registration form, no password, and no third-party identity provider (REQ-ACC-001).
- A user has one role (viewer, analyst, or admin; REQ-NFR-012). The administrator chooses the role on the invitation, and the role is stored with the user in the database. Cloudflare Access groups are not used for roles.
- The flow is built directly on Workers and D1, with no authentication library (OQ-029). The rules for consuming tokens and for invitation-gated creation do not fit a generic library.
- Cloudflare Access can still protect internal routes such as admin tooling.

## Consequences

- REQ-NFR-007 and the security document describe invitation-based accounts instead of Cloudflare Access.
- ADR 0004 no longer assigns authentication to Cloudflare Access.
- Rate limits for link requests and token use are kept in a Durable Object (ADR 0017); the invitation token is consumed when the account is created (REQ-ACC-003), the sign-in token on Continue (REQ-ACC-004).
- The data model gains users, invitations, sessions, and audit events (see [data model](../architecture/data-model.md)).
- Resend becomes a processor of email addresses. The privacy policy names it (REQ-ACC-008).
- Deliverability matters: the sending domain needs SPF, DKIM, and DMARC (REQ-ACC-007).
- The platform stores personal data (name and email), so REQ-NFR-009 and the security document describe it, and account deletion is a requirement (REQ-ACC-008).
- Phase 4 grows by the REQ-ACC requirements.
