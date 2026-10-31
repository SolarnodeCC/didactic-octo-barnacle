"""Check the repository and CI hardening rules of REQ-NFR-021.

Run from the repository root: python3 scripts/check-hardening.py

A rule that is only written down gets undone by a later change, so each rule is checked
here, in CI, on every pull request. Rules (see docs/kt/decisions/0033-repository-hardening-guardrails.md):

1. Every `uses:` in a workflow is pinned to a full commit SHA.
2. Every `actions/checkout` sets `persist-credentials: false`.
3. Every workflow sets `permissions` at the top level.
4. No workflow uses `pull_request_target`, and a workflow that runs on `pull_request`
   does not use secrets.
5. No `run:` script interpolates event data or workflow inputs (script injection).
6. Dependabot covers github-actions, pip, and npm.
7. CODEOWNERS has a default owner (`*`).
8. `wrangler.toml` turns off workers.dev and preview URLs and never turns them on.
9. CI audits the dependencies (`audit:ci` in package.json and in ci.yml).
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(".")
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
SHA_PIN = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")
UNTRUSTED = re.compile(
    r"\$\{\{\s*(github\.event\.|github\.head_ref|inputs\.|github\.event_name\s*==)", re.I
)

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def triggers(workflow: dict) -> set[str]:
    # PyYAML reads the key `on` as the boolean True.
    value = workflow.get("on", workflow.get(True, {}))
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return set(value)
    return set(value or {})


def check_workflows() -> None:
    if not WORKFLOWS:
        fail("no workflows found in .github/workflows")
    for path in WORKFLOWS:
        text = path.read_text()
        workflow = yaml.safe_load(text)
        name = path.name
        if "permissions" not in workflow:
            fail(f"{name}: set `permissions` at the top level (least privilege)")
        events = triggers(workflow)
        if "pull_request_target" in events:
            fail(f"{name}: pull_request_target is not allowed")
        if "pull_request" in events and re.search(r"\bsecrets\.", text):
            fail(f"{name}: a workflow that runs on pull_request must not use secrets")
        for job_name, job in (workflow.get("jobs") or {}).items():
            for index, step in enumerate(job.get("steps") or []):
                where = f"{name}: job {job_name}, step {index + 1}"
                uses = step.get("uses")
                if uses and not uses.startswith("./") and not SHA_PIN.match(uses):
                    fail(f"{where}: pin `{uses}` to a full commit SHA")
                if uses and uses.startswith("actions/checkout@"):
                    persist = (step.get("with") or {}).get("persist-credentials")
                    if persist is not False:
                        fail(f"{where}: actions/checkout needs `persist-credentials: false`")
                run = step.get("run")
                if run and UNTRUSTED.search(run):
                    fail(f"{where}: pass event data or inputs through `env`, not into `run`")


def check_dependabot() -> None:
    config = yaml.safe_load((ROOT / ".github" / "dependabot.yml").read_text())
    covered = {u.get("package-ecosystem") for u in config.get("updates", [])}
    for ecosystem in ("github-actions", "pip", "npm"):
        if ecosystem not in covered:
            fail(f"dependabot.yml: add the `{ecosystem}` ecosystem")


def check_codeowners() -> None:
    lines = (ROOT / ".github" / "CODEOWNERS").read_text().splitlines()
    if not any(re.match(r"^\*\s+@\S+", line) for line in lines):
        fail("CODEOWNERS: add a default owner line `* @owner` so no path is unowned")


def check_wrangler() -> None:
    text = (ROOT / "infrastructure" / "cloudflare" / "wrangler.toml").read_text()
    for key in ("workers_dev", "preview_urls"):
        top = re.search(rf"^{key}\s*=\s*(\w+)", text, re.M)
        if not top or top.group(1) != "false":
            fail(f"wrangler.toml: set `{key} = false` at the top level")
        if re.search(rf"^\s*{key}\s*=\s*true", text, re.M):
            fail(f"wrangler.toml: `{key} = true` is not allowed")


def check_audit() -> None:
    package = json.loads((ROOT / "package.json").read_text())
    if "audit:ci" not in package.get("scripts", {}):
        fail("package.json: add the `audit:ci` script")
    if "pnpm audit:ci" not in (ROOT / ".github" / "workflows" / "ci.yml").read_text():
        fail("ci.yml: run `pnpm audit:ci`")


def main() -> None:
    check_workflows()
    check_dependabot()
    check_codeowners()
    check_wrangler()
    check_audit()
    if errors:
        for error in errors:
            print(f"hardening error: {error}")
        sys.exit(1)
    print(f"hardening ok: {len(WORKFLOWS)} workflows, dependabot, CODEOWNERS, wrangler, audit")


main()
