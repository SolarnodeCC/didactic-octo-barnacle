---
title: "0020: Foundation tooling: lint, migrations, infrastructure bootstrap, accounts"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-NFR-020, REQ-TEST-001, REQ-DATA-001]
---

# 0020: Foundation tooling: lint, migrations, infrastructure bootstrap, accounts

- Decision status: Accepted
- Date: 2026-10-29

## Context

ADR 0008 fixed the language, package manager, schema library, and test tools, and left lint and format tools to the first package. The data model leaves table names to the first migration, the operations document says environments each have their own resources without saying how they are created, and the collector needs accounts and credentials before it can run.

## Options considered

- **Lint and format:** ESLint with Prettier, or Biome. ESLint has the widest plugin ecosystem (Next.js, React, Cloudflare); Biome is one tool with less configuration.
- **D1 migrations:** plain SQL files applied with Wrangler, or Drizzle ORM with generated migrations. Drizzle adds typed queries but a second schema source next to Zod and an ADR for a new dependency (REQ-NFR-002).
- **Environment resources:** Wrangler configuration plus a bootstrap script, or Terraform. Terraform gives state and plan review but adds a tool, state storage, and credentials.
- **Accounts:** paid Cloudflare Workers plan and an OpenAlex key, or free tiers first. Free CPU limits cannot run PDF extraction (ADR 0009).

## Decision

- **Lint and format:** ESLint and Prettier, configured once at the workspace root. Both run in CI from phase 1 (see [CI gates](../test/ci-gates.md)).
- **Migrations:** plain SQL files in `infrastructure/cloudflare/migrations`, numbered in order and applied with `wrangler d1 migrations` before the dependent Worker is deployed. Migrations are forward-only. Types come from the Zod schemas in `packages/models`, and a test checks that the migrated schema holds the columns the contracts need. There is no ORM.
- **Environment resources:** one Wrangler configuration per environment and one idempotent bootstrap script in `infrastructure/cloudflare` that creates missing resources (D1, R2, Queues with dead-letter queues, Vectorize, Durable Object namespaces, AI Gateway) and reports drift. There is no Terraform.
- **Accounts:** a paid Cloudflare Workers plan and an OpenAlex API key or contact email, registered by the project owner. Secret names are listed in [operations](../operations.md); values are never committed.

## Consequences

- REQ-NFR-020 states the migration and bootstrap rules and their tests.
- The technology stack lists ESLint and Prettier. The first package adds their configuration and the `install` command in `.cursor/environment.json` changes with it (ADR 0008).
- A later move to Drizzle or Terraform needs a new ADR.
- Phase 1 depends on the owner creating the Cloudflare account, the API token, and the OpenAlex key.
