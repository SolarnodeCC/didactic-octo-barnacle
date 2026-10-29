---
title: "0007: Toolchain: Node 24, pnpm, TypeScript, Zod, Vitest, Playwright"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-29
related: [REQ-NFR-002, REQ-TEST-001, REQ-TEST-002, REQ-TEST-003, REQ-API-003]
---

# 0007: Toolchain: Node 24, pnpm, TypeScript, Zod, Vitest, Playwright

- Decision status: Accepted
- Date: 2026-10-29

## Context

OQ-018 asks for the package manager, monorepo tooling, language versions, schema library, and test tools. ADR 0003 already makes all runtime code TypeScript. The contracts in [contract conventions](../agents/contract-conventions.md) are defined once in `packages/models` and shared by agents, the API, and tests. Node 24 is the Active LTS line; Node 26 was scheduled to become LTS on 2026-10-28.

## Options considered

- **Package manager:** pnpm workspaces, npm workspaces, or Yarn. pnpm has a strict dependency graph and a fast frozen-lockfile install.
- **Monorepo tooling:** Turborepo or Nx on top of the workspaces, or none. The repository has no build-time problem yet.
- **Schema library:** Zod, Valibot, or JSON Schema with Ajv. Zod gives types from schemas, cross-field refinements, and a large ecosystem.
- **Worker test integration:** the older `@cloudflare/vitest-pool-workers` or the current `@cloudflare/vitest-plugin`, a Vite plugin that runs Vitest in the Workers runtime.

## Decision

| Area | Choice |
|---|---|
| Language | TypeScript in `strict` mode, ES modules only |
| Runtime for tooling and CI | Node 24 LTS, pinned in `.nvmrc`, in `engines`, and in `.cursor/environment.json` |
| Package manager | pnpm workspaces, pinned through the `packageManager` field and Corepack, with a committed lockfile and `pnpm install --frozen-lockfile` in CI |
| Monorepo tooling | None beyond pnpm workspaces; add one only when build times justify it |
| Pipeline Workers | `apps/pipeline` holds the collector, document processing, and the pipeline workflow |
| Schema library | Zod in `packages/models`; types come from `z.infer`; field names stay PascalCase as in the contracts |
| Unit and contract tests | Vitest |
| Integration tests | Vitest with `@cloudflare/vitest-plugin`, using local bindings |
| End-to-end tests | Playwright, with `@axe-core/playwright` for the accessibility check (REQ-DASH-006) |

Pin the exact versions of Vitest, `@cloudflare/vitest-plugin`, Wrangler, and Playwright, and update them together. Pin `compatibility_date` in each Wrangler configuration and enable `nodejs_compat` where a dependency needs it.

## Consequences

- Moving to Node 26 is a later change to the pins, made once Wrangler, Next.js, and the dependencies support it.
- The `install` command in `.cursor/environment.json` and the `setup-worktree` commands in `.cursor/worktrees.json` change with the first package, to check the Node version and run the pnpm install.
- Check that Vectorize and Workflows bindings run under the local test runtime when the first integration test needs them. If they do not, record the exception in [test levels](../test/levels.md).
- Lint and format tools are chosen with the first package; they need no ADR.
- [Technology stack](../architecture/technology-stack.md), [repository layout](../architecture/repository-layout.md), and [test levels](../test/levels.md) carry this decision.
