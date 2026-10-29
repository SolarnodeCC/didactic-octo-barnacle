---
title: Account requirements
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-007, REQ-NFR-009, REQ-NFR-012]
---

# Account requirements

Accounts exist by invitation only. A person signs in with a one-time link sent by email through Resend, and has no password. The decision and its alternatives are in [ADR 0011](../decisions/0011-invitation-only-accounts-with-magic-links.md); the security controls are in [security](../architecture/security.md).

### REQ-ACC-001: Invitation-only accounts

An account can be created only from a valid invitation.

- Phase: 4
- Priority: must
- Status: planned
- Source: product decision to go public with invitation-only access
- Depends on: REQ-ACC-002
- Acceptance criteria:
  1. No page and no API route creates a user without a valid, unexpired, unused invitation.
  2. The sign-in screen has no registration form and no sign-in through a third-party identity provider.
  3. The email address of an account is the address the invitation was sent to and cannot be changed during account creation.
- Verification: end-to-end test and integration test

### REQ-ACC-002: Invitations

An administrator invites a person by email and assigns a role.

- Phase: 4
- Priority: must
- Status: planned
- Source: product decision to go public with invitation-only access
- Acceptance criteria:
  1. Only an administrator can create, resend, or revoke an invitation.
  2. An invitation holds the email address, the role (viewer, analyst, or admin; REQ-NFR-012), the inviting administrator, and an expiry of 7 days.
  3. The invitation token has at least 128 bits of randomness, and only its hash is stored.
  4. Resending an invitation invalidates the earlier token. A revoked or expired invitation is refused with a message that does not reveal whether an account exists.
  5. An administrator sees each invitation as pending, accepted, expired, or revoked.
  6. The number of pending invitations is capped by configuration (default 50). An optional allowlist of email domains per environment restricts which addresses can be invited; when it is set, an invitation to another domain is refused with a clear message.
- Verification: integration test and end-to-end test

### REQ-ACC-003: Create an account after opening an invitation

An invited person opens the invitation link, is signed in, and completes an account.

- Phase: 4
- Priority: must
- Status: planned
- Source: product decision to go public with invitation-only access
- Depends on: REQ-ACC-002, REQ-ACC-004
- Acceptance criteria:
  1. Opening a valid invitation link verifies the email address and starts a session that can reach only the create-account screen.
  2. The create-account screen asks for a name and the acceptance of the terms and the privacy policy, and shows the email address read-only.
  3. Submitting it creates the user with the invited role and consumes the invitation. The person then reaches the dashboard without another email.
  4. The invitation token is consumed when the account is created, not when the link is opened. Until then the same link works again until it expires (7 days); after the account is created, the link is refused. Opening it never grants more than the create-account screen.
  5. A person who leaves before submitting has no user record.
- Verification: end-to-end test

### REQ-ACC-004: Sign in with a one-time link

An existing user signs in with a link sent by email.

- Phase: 4
- Priority: must
- Status: planned
- Source: product decision to go public with invitation-only access
- Acceptance criteria:
  1. A sign-in link works once and expires after 15 minutes. Only its hash is stored.
  2. The response to a link request is the same whether or not an account exists for the address.
  3. A link requested for an address with a pending invitation and no account leads to the create-account screen.
  4. A session cookie is `HttpOnly`, `Secure`, and `SameSite=Lax`, and has a lifetime of 7 days absolute and 24 hours idle (24 hours absolute for the admin role), all configurable.
  5. The dashboard and the API accept the same session and refuse a request without one (REQ-NFR-007).
  6. A sign-in or invitation link opens a confirmation page, and the token is consumed only when the person presses Continue, so that mail scanners that open links do not use it up.
- Verification: integration test and end-to-end test, including a test that opens the link with a plain GET request first

### REQ-ACC-005: Abuse limits

Link requests and invitation use are rate limited.

- Phase: 4
- Priority: must
- Status: planned
- Source: KT review of security
- Acceptance criteria:
  1. Sign-in link requests are limited to 5 per hour per email address and 20 per hour per IP address.
  2. Failed or reused tokens are limited to 10 per hour per IP address. The counters are kept in a Durable Object (ADR 0017), and the IP address is taken from the `CF-Connecting-IP` header.
  3. A limited request returns the generic response of REQ-ACC-004 or a rate-limit error that does not reveal whether an account exists.
- Verification: integration test

### REQ-ACC-006: Roles and revocation

An administrator can remove access immediately, and the platform always keeps one administrator.

- Phase: 4
- Priority: must
- Status: planned
- Source: REQ-NFR-007 acceptance criterion on revocation
- Acceptance criteria:
  1. The roles are defined in REQ-NFR-012. Only an admin can invite, change a role, or deactivate a user.
  2. Deactivating a user ends all of their sessions, and their next request is refused within one minute, without a deployment.
  3. The last active administrator cannot be deactivated or demoted.
- Verification: integration test and end-to-end test

### REQ-ACC-007: Delivery of account emails

Invitation and sign-in emails are sent through Resend from a verified domain.

- Phase: 4
- Priority: must
- Status: planned
- Source: product decision to use Resend for magic links
- Acceptance criteria:
  1. The sending domain is verified with SPF, DKIM, and DMARC before launch.
  2. Emails have a plain-text part, no tracking pixels, and no link tracking that rewrites the token link.
  3. A bounce or complaint reported by Resend is recorded, and an administrator sees that the invitation was not delivered.
  4. The Resend API key is a secret listed in [operations](../operations.md) and is never logged.
- Verification: integration test with a stubbed Resend and a manual check of the domain records

### REQ-ACC-008: Account deletion

A user can delete their account.

- Phase: 4
- Priority: must
- Status: planned
- Source: REQ-NFR-009 and privacy law
- Acceptance criteria:
  1. A user can delete their own account in settings. It removes the name, the email address, and the sessions.
  2. Records that refer to the user are anonymized or removed: score reviews (REQ-SCORE-007) and status entries (REQ-DASH-004) keep the record and replace the user with a deleted-user marker, invitations the user sent keep no name, and audit events (REQ-ACC-009) keep an opaque actor ID with no name or email.
  3. The last active administrator cannot delete their account (REQ-ACC-006).
  4. The privacy policy states what is stored, why, and for how long.
- Verification: integration test and review of the privacy policy

### REQ-ACC-009: Audit log

Security-relevant account events are recorded.

- Phase: 4
- Priority: should
- Status: planned
- Source: KT review of security
- Acceptance criteria:
  1. Invitation created, resent, revoked, and accepted; sign-in; role change; deactivation; account deletion; and the admin operations of REQ-ADM-001 to REQ-ADM-003 are recorded with the actor and the time.
  2. The log never holds a token or a session identifier.
  3. An administrator can read the log.
- Verification: integration test

### REQ-ACC-010: Account settings

A user manages their own profile and sessions.

- Phase: 4
- Priority: must
- Status: planned
- Source: [screen specification](../ux/screens.md) for the signed-in experience
- Depends on: REQ-ACC-003, REQ-ACC-004
- Acceptance criteria:
  1. A user can change their name; it must have 1 to 100 characters. The email address is read-only.
  2. The page shows the user's role and recent sign-ins with the time and the device.
  3. A user can end all their other sessions.
  4. Account deletion is offered on the same page (REQ-ACC-008).
- Verification: end-to-end test

### REQ-ACC-011: Legal pages and support contact

People can read the terms and the privacy policy and can reach support.

- Phase: 4
- Priority: must
- Status: planned
- Source: security review of a public launch
- Depends on: REQ-ACC-003
- Acceptance criteria:
  1. The terms, the privacy policy, and a support contact are linked from the footer of every page and from the create-account screen.
  2. The privacy policy names the processors of personal data, including Resend and the model providers, and the retention period of account and sign-in records.
  3. The version and the date of the terms a user accepted are stored with the user (REQ-ACC-003).
- Verification: end-to-end test and review of the privacy policy
