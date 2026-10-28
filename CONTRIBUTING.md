# Contributing

`README.md` is the product source of truth. `AGENTS.md` is the instruction file for Cursor and Claude Code.

- Open a pull request. Do not commit directly to `main`.
- Keep credentials out of git. Use Cursor environment secrets or GitHub Actions secrets.
- The license is MIT. Keep `LICENSE` and the License section of `README.md` in agreement.
- When you add an application, extend the `install` command in `.cursor/environment.json` and the `setup-worktree` commands in `.cursor/worktrees.json`.
- Run the `install` command from `.cursor/environment.json`, then `python3 scripts/check-config.py`, before opening a pull request. CI runs the same check.
