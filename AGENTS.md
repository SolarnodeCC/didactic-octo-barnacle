# Research Opportunity Intelligence Platform

This repository specifies a platform that turns scientific publications into scored software opportunities. The knowledge transfer (KT) documents in `docs/kt/` are the product source of truth; `README.md` is a summary that links to them (see `docs/kt/decisions/0002-kt-documents-are-source-of-truth.md`). The checked-in tree is that specification plus the MIT `LICENSE`. The apps, agents, packages, and Cloudflare infrastructure described in the KT documents are not implemented yet.

Planned layout, once code exists:

- `apps/dashboard` and `apps/api`
- `agents/research-agent`, `agents/startup-agent`, and `agents/scoring-agent`
- `packages/vector-store`, `packages/prompts`, and `packages/models`
- `infrastructure/cloudflare`

The intended stack is Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, and AI Gateway; Next.js on Cloudflare Pages with Tailwind CSS; and LangGraph with OpenAI or Anthropic. Academic sources named in the KT documents are OpenAlex, arXiv, and Semantic Scholar.

Do not invent credentials, commit secrets, or add a second license. Open a pull request instead of committing to `main`.

## Checks

- Configuration check: `python3 scripts/check-config.py` from the repository root (after `install`, or after `python3 -m pip install -r scripts/requirements.txt`). It parses every JSON and YAML file and the frontmatter of `.cursor/rules/*.mdc`. CI runs the same script.
- KT check: `python3 scripts/check-kt.py` from the repository root. It checks frontmatter, file size limits (400 lines and 25 KiB per file, 40 requirements per requirement file), directory indexes, relative links, and requirement IDs in `docs/kt/`. CI runs the same script.
- Workspace check: run the `install` command from `.cursor/environment.json`. That command also installs `scripts/requirements.txt`.

## KT documents

- Check every change against `docs/kt/requirements/`. Name the REQ-IDs a pull request implements or changes, and name the REQ-ID a test verifies in the test's name.
- Update the affected KT document or requirement in the same pull request as a behavior change. Record decisions as ADRs in `docs/kt/decisions/`.
- Keep files small: one topic per file, and split a file into a directory with a `README.md` index before it reaches the limits. Every directory in `docs/kt/` has a `README.md` that links every file in it.
- Write KT documents in English. Never reuse a REQ-ID; set `Status: dropped` instead of deleting a requirement.
- The test strategy is in `docs/kt/test/`.

## Repository conventions

- The license is MIT. Keep `LICENSE` and the License section of `README.md` in agreement.
- Put API keys and Cloudflare tokens in Cursor environment secrets or GitHub Actions secrets, never in the repository.
- Markdown: other files may add instructions but must not contradict the KT documents in `docs/kt/`. Use a fenced code block with a language tag for commands, JSON, YAML, and diagrams. Keep secrets, tokens, and local machine paths out.
- JSON: commit strict JSON, with no comments and no trailing commas. Keep secrets, snapshot IDs, and machine-local paths out. `.cursor/environment.json` holds `install` and, when a server exists, `start`; dependency installs go in `install` and long-running processes in `start`.
- YAML: name the GitHub Actions secret or Cursor environment secret instead of writing a secret value. Quote values that contain `:`, `#`, or leading wildcard characters. Keep `.cursor/config/bugbot.yaml` to the documented Bugbot keys: `version`, `triggers`, `review`, `prSummary`, and `autofix`.
- `.claude/settings.json` denies Claude Code reads of `.env` files (except `.env.example`), `*.pem` files, and `secrets/**` directories.

## Cursor Cloud specific instructions

- The Cloud Agent base is Cursor's default image. There is no Dockerfile and no `start` command, because nothing needs to stay running.
- `install` in `.cursor/environment.json` checks that `README.md` and `LICENSE` are present, that `git`, `node`, and `python3` are on `PATH`, and installs `scripts/requirements.txt`. Run that same command from the repository root to confirm the workspace. It is safe to run more than once.
- `.cursor/worktrees.json` runs the same README, LICENSE, and tool checks when Cursor creates a worktree. `.cursor/mcp.json` has no project MCP servers. There is no `hooks.json` until a hook script exists.
- There is no dev server, test suite, or application package install yet. Reading `docs/kt/` is the product check, `scripts/check-config.py` is the configuration check, and `scripts/check-kt.py` is the KT check.
- When a lockfile arrives, add its package-manager install to `install` and keep the command idempotent. Start dev servers from `start`.
- Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab. Do not write them into this file or into `environment.json`.
- A saved Cloud Agent environment uses this file only after its environment.json location points at `.cursor/environment.json`. Until then, the saved install command remains the one stored in the dashboard.
