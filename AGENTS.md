# Research Opportunity Intelligence Platform

This repository specifies a platform that turns scientific publications into scored software opportunities. `README.md` is the product source of truth. The checked-in tree is that specification plus the MIT `LICENSE`. The apps, agents, packages, and Cloudflare infrastructure described in the README are not implemented yet.

Planned layout, once code exists:

- `apps/dashboard` and `apps/api`
- `agents/research-agent`, `agents/startup-agent`, and `agents/scoring-agent`
- `packages/vector-store`, `packages/prompts`, and `packages/models`
- `infrastructure/cloudflare`

The intended stack is Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, and AI Gateway; Next.js on Cloudflare Pages with Tailwind CSS; and LangGraph with OpenAI or Anthropic. Academic sources named in the README are OpenAlex, arXiv, and Semantic Scholar.

Do not invent credentials, commit secrets, or add a second license. Open a pull request instead of committing to `main`.

## Checks

- Configuration check: `python3 -m pip install -r scripts/requirements.txt`, then `python3 scripts/check-config.py` from the repository root. It parses every JSON and YAML file and the frontmatter of `.cursor/rules/*.mdc`. CI runs the same script.
- Workspace check: run the `install` command from `.cursor/environment.json`.

## Repository conventions

- The license is MIT. Keep `LICENSE` and the License section of `README.md` in agreement.
- Put API keys and Cloudflare tokens in Cursor environment secrets or GitHub Actions secrets, never in the repository.
- Markdown: other files may add instructions but must not contradict `README.md`. Use a fenced code block with a language tag for commands, JSON, YAML, and diagrams. Keep secrets, tokens, and local machine paths out.
- JSON: commit strict JSON, with no comments and no trailing commas. Keep secrets, snapshot IDs, and machine-local paths out. `.cursor/environment.json` holds `install` and, when a server exists, `start`; dependency installs go in `install` and long-running processes in `start`.
- YAML: name the GitHub Actions secret or Cursor environment secret instead of writing a secret value. Quote values that contain `:`, `#`, or leading wildcard characters. Keep `.cursor/config/bugbot.yaml` to the documented Bugbot keys: `version`, `triggers`, `review`, `prSummary`, and `autofix`.
- `.claude/settings.json` denies Claude Code reads of `.env` files (except `.env.example`), `*.pem` files, and `secrets/`.

## Cursor Cloud specific instructions

- The Cloud Agent base is Cursor's default image. There is no Dockerfile and no `start` command, because nothing needs to stay running.
- `install` in `.cursor/environment.json` checks that `README.md` and `LICENSE` are present and that `git`, `node`, and `python3` are on `PATH`. Run that same command from the repository root to confirm the workspace. It is safe to run more than once.
- `.cursor/worktrees.json` runs the same file check when Cursor creates a worktree. `.cursor/mcp.json` has no project MCP servers. There is no `hooks.json` until a hook script exists.
- There is no dev server, test suite, or application package install yet. Reading `README.md` is the product check, and `scripts/check-config.py` is the configuration check.
- When a lockfile arrives, add its package-manager install to `install` and keep the command idempotent. Start dev servers from `start`.
- Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab. Do not write them into this file or into `environment.json`.
- A saved Cloud Agent environment uses this file only after its environment.json location points at `.cursor/environment.json`. Until then, the saved install command remains the one stored in the dashboard.
