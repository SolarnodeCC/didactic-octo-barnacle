---
title: "0029: PDF fetcher host policy"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-30
related: [REQ-DATA-004, REQ-DATA-010, REQ-NFR-001]
---

# 0029: PDF fetcher host policy

- Decision status: Accepted
- Date: 2026-10-30

## Context

REQ-DATA-010 asks for an "allowlisted fetcher" for PDFs. Open access PDFs are served from thousands of hosts (universities, publishers, repositories), and the URL comes from a source record that the platform does not control. A strict allowlist from day one would skip most PDFs, and phase 1 needs to measure how many can be stored.

## Options considered

1. **Hard rules for every host, with an optional host list that starts empty.** One audited fetcher refuses everything that is not an https URL on a public name; the list can be filled later.
2. **A strict allowlist of approved hosts from the start.** Safer, but most PDFs are skipped and the measured coverage is low.

## Decision

Option 1. "Allowlisted" means that one fetcher is the only code allowed to download PDFs, and that it applies the rules in [security](../architecture/security.md): `https` on port 443, public host names only, each redirect checked, size and time limits, and a check of the content type and the file's first bytes. `pdf.allowed_hosts` (empty by default) limits fetching to listed hosts when set. Refused hosts are logged by name only, so the list can be built from the phase 1 measurements.

## Consequences

- The Worker cannot resolve DNS, so it cannot detect a public name that points to a private address. Cloudflare does not route a Worker's requests to its own internal network, which limits the harm; a host list closes the gap when needed.
- A file that can never be fetched is completed with its reason in the message log; a transient failure is retried and can be dead-lettered and replayed.
- Moving to option 2 later is a configuration change, not a code change.
- Update 2026-10-31 (ADR 0033): names that embed an IP address (`10.0.0.1.example.org`, `10-0-0-1.example.org`) and public wildcard-DNS services such as `nip.io` are refused too. They are public names that point inside a network, which the Worker cannot see by resolving DNS.
