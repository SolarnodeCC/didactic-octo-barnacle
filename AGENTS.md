# Research Opportunity Intelligence Platform

This repository specifies a platform that turns scientific publications into scored software opportunities. `README.md` is the product source of truth. The checked-in tree is that specification plus the MIT `LICENSE`. The apps, agents, packages, and Cloudflare infrastructure described in the README are not implemented yet.

Planned layout, once code exists:

- `apps/dashboard` and `apps/api`
- `agents/research-agent`, `agents/startup-agent`, and `agents/scoring-agent`
- `packages/vector-store`, `packages/prompts`, and `packages/models`
- `infrastructure/cloudflare`

The intended stack is Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, and AI Gateway; Next.js on Cloudflare Pages with Tailwind CSS; and LangGraph with OpenAI or Anthropic. Academic sources named in the README are OpenAlex, arXiv, and Semantic Scholar.

Do not invent credentials, commit secrets, or add a second license. Open a pull request instead of committing to `main`.

## Cursor Cloud specific instructions

- The Cloud Agent base is Cursor's default image. There is no Dockerfile and no `start` command, because nothing needs to stay running.
- `install` in `.cursor/environment.json` checks that `README.md` and `LICENSE` are present and that `git`, `node`, and `python3` are on `PATH`. Run that same command from the repository root to confirm the workspace. It is safe to run more than once.
- There is no dev server, test suite, or package install yet. Reading `README.md` is the product check.
- When a lockfile arrives, add its package-manager install to `install` and keep the command idempotent. Start dev servers from `start`.
- Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab. Do not write them into this file or into `environment.json`.
- A saved Cloud Agent environment uses this file only after its environment.json location points at `.cursor/environment.json`. Until then, the saved install command remains the one stored in the dashboard.
