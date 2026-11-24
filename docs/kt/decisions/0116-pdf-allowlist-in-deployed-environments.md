---
title: "0116: Staging and production fetch PDFs only from allowlisted hosts"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-24
related: [REQ-DATA-010, REQ-NFR-021]
---

# 0116: Staging and production fetch PDFs only from allowlisted hosts

- Decision status: Accepted
- Date: 2026-11-24
- Changes: REQ-DATA-010 (criterion 5), [ADR 0029](0029-pdf-fetcher-host-policy.md), [security](../architecture/security.md#pdf-fetcher), [defaults](../architecture/defaults.md), [operations](../operations.md#runbooks)

## Context

ADR 0029 kept `pdf.allowed_hosts` empty so phase 1 could measure how many PDFs can be stored. The security review of 2026-11-23 (issue 176, high) found that this leaves the fetcher open: a PDF URL comes from OpenAlex or arXiv metadata that outside authors influence, so anyone who can publish metadata can make the Worker fetch from a host they run, probe from its egress address, or fill the document queue with 25 MiB downloads.

On 2026-11-24 staging held 16,167 stored PDFs from 2,292 hosts. The 87 hosts with 20 or more PDFs hold only about 60 % of them.

## Options considered

1. **Proven hosts:** every host that has already served a stored PDF, by exact name, in staging and production. No stored coverage is lost, and every new host is refused and logged until a pull request adds it.
2. **Top hosts only:** about 87 hosts with 20 or more PDFs and the main repositories. Tighter, but about 40 % of today's PDFs would no longer be fetched.
3. **Keep the fetcher open** and record the risk.

## Decision

Option 1, chosen by the owner on 2026-11-24.

- `apps/pipeline/src/documents/pdf-proven-hosts.json` lists the hosts of the stored PDFs in staging on 2026-11-24, sorted and lower-case. The list was read from D1 and checked against it by a checksum of the names.
- These hosts match by exact name only. Some are shared storage such as `<bucket>.s3.amazonaws.com`, where anyone can create a name below a listed one. `pdf.allowed_hosts` keeps matching subdomains and stays for curated domains.
- `pdfHostPolicy` in `apps/pipeline/src/config.ts` gives `local` and `preview` the open policy of ADR 0029 and every other environment name, a misspelled one included, the allowlist. An environment with an empty allowlist refuses every host.
- The check applies to the first URL and to every redirect target. The hard rules of ADR 0029 come first: a listed host that embeds an IP address or is the platform's own domain is still refused.
- `document.refused` logs the host of the URL and, when a redirect target was refused, `refusedHost`.

## Consequences

- A publication from a new host stays abstract-only until its host is added. A host is added by a pull request after a review of the `document.refused` log lines, so the list can grow only through review.
- A host that redirects to a host not on the list, such as `doi.org` to a publisher, is refused at the redirect. The `refusedHost` field names the target to review.
- Hosts are allowed by name; a hostile page on an allowed host is still limited by the size, time, content-type, and first-bytes checks, and by the license check before storage.
- Production starts from the same list as staging.
