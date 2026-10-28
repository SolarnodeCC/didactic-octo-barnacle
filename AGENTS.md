# Research Opportunity Intelligence Platform

This repository specifies a platform that turns scientific publications into scored software opportunities. `README.md` is the product source of truth. The checked-in tree is that specification plus the MIT `LICENSE`. The apps, agents, packages, and Cloudflare infrastructure described in the README are not implemented yet.

Planned layout, once code exists:

- `apps/dashboard` and `apps/api`
- `agents/research-agent`, `agents/startup-agent`, and `agents/scoring-agent`
- `packages/vector-store`, `packages/prompts`, and `packages/models`
- `infrastructure/cloudflare`

The intended stack is Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, and AI Gateway; Next.js on Cloudflare Pages with Tailwind CSS; and LangGraph with OpenAI or Anthropic. Academic sources named in the README are OpenAlex, arXiv, and Semantic Scholar.

Do not invent credentials, commit secrets, or add a second license. Open a pull request instead of committing to `main`.

## Model tiers

Cursor and Claude Code can do the same work. Pick the tier by the task, not by the tool. Start at Balance and step up only when the task needs it.

| Tier | Model | Use for |
|---|---|---|
| Cost | Claude Code Haiku (effort low), or Cursor Composer 2.5 selected explicitly | Small changes, documentation, configuration, explanations, and simple tasks. Avoid Cursor Auto when you want to control the Claude pool, because Auto can route to Claude without showing it. |
| Balance | Claude Code Sonnet (effort medium), or Cursor Composer Auto | New features, refactors, multi-file changes, and medium-sized development tasks. |
| Intelligence | Claude Code Opus, Sonnet 5.5 (effort high), Grok 4.7, or GPT-5.6 Sol | Architecture design, complex debugging, migrations, root-cause analysis, and strategic technical decisions. |

- `.claude/settings.json` sets Claude Code to the Balance tier. Switch per session with `/model` and `/effort`, for example `/model haiku` with `/effort low`, or `/model opus`.
- Claude Pro limits are shared with claude.ai chat. Cursor's Other Models pool is the fallback for Claude models when they run out.
- Keep Cursor on-demand usage and Claude usage credits off unless you turn them on deliberately.

## Cursor Cloud specific instructions

- The Cloud Agent base is Cursor's default image. There is no Dockerfile and no `start` command, because nothing needs to stay running.
- `install` in `.cursor/environment.json` checks that `README.md` and `LICENSE` are present and that `git`, `node`, and `python3` are on `PATH`. Run that same command from the repository root to confirm the workspace. It is safe to run more than once.
- `.cursor/worktrees.json` runs the same file check when Cursor creates a worktree. `.cursor/mcp.json` has no project MCP servers. There is no `hooks.json` until a hook script exists.
- There is no dev server, test suite, or package install yet. Reading `README.md` is the product check.
- When a lockfile arrives, add its package-manager install to `install` and keep the command idempotent. Start dev servers from `start`.
- Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab. Do not write them into this file or into `environment.json`.
- A saved Cloud Agent environment uses this file only after its environment.json location points at `.cursor/environment.json`. Until then, the saved install command remains the one stored in the dashboard.
