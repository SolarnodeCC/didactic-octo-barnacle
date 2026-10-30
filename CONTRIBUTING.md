# Contributing

The KT documents in `docs/kt/` are the product source of truth; `README.md` is a summary. `AGENTS.md` is the instruction file for Cursor and Claude Code.

- Open a pull request. Do not commit directly to `main`.
- Keep credentials out of git. Use Cursor environment secrets or GitHub Actions secrets.
- The license is MIT. Keep `LICENSE` and the License section of `README.md` in agreement.
- When you add an application, extend the `install` command in `.cursor/environment.json` and the `setup-worktree` commands in `.cursor/worktrees.json`.
- Name the requirement IDs (`REQ-<AREA>-<NNN>`) a pull request implements or changes, and update the affected KT documents in the same pull request. See `docs/kt/README.md` for the rules and templates.
- Use Node 24 (see `.nvmrc`) and pnpm via Corepack (ADR 0008).
- Run the `install` command from `.cursor/environment.json`, then `python3 scripts/check-config.py`, `python3 scripts/check-kt.py`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, and `pnpm check:traceability`, before opening a pull request. CI runs the same checks.
