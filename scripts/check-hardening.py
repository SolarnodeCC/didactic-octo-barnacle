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
8. Every `wrangler.toml` (the pipeline's and each app's) turns off workers.dev and preview URLs
   and never turns them on.
9. CI audits the dependencies (`audit:ci` in package.json and in ci.yml).
10. A workflow that runs on `workflow_run` limits it to `branches: [main]`, and no job passes
    `secrets: inherit` to a called workflow (ADR 0046).
11. No job calls (`uses:`) a local workflow whose jobs use an `environment`. Environment
    secrets do not reach a job of a called workflow, so it would run with empty credentials;
    start such a workflow as its own run with `gh workflow run` instead (ADR 0046).
12. A job that uses an `environment` runs only on `main`: its `if` contains
    `github.ref == 'refs/heads/main'`, so a branch cannot read the environment's secrets
    even when the environment's branch policy is changed (ADR 0074).
13. A job that uses an `environment` puts no secret in its job-level `env`: secrets go to
    the steps that need them, so dependency install scripts never see them (ADR 0074).
14. `ERASURE_HASH_KEY` appears only in the deploy workflows, which upload it as a Worker
    secret. No other workflow may read the key of the erasure list (REQ-NFR-016, ADR 0123).
15. No Worker configuration gives a Worker a `route`, `routes`, or a custom domain outside
    the `local` and `preview` environments, unless `AUTHENTICATED_ROUTES` names the Worker
    and the ADR of the authentication in front of it. The phase 4 authentication pull request
    adds the dashboard and API there after its security review (REQ-NFR-007, ADR 0058,
    ADR 0123).
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import tomllib

import yaml

ROOT = pathlib.Path(".")
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
SHA_PIN = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")
UNTRUSTED = re.compile(
    r"\$\{\{\s*(github\.event\.|github\.head_ref|inputs\.|github\.event_name\s*==)", re.I
)

MAIN_GUARD = "github.ref == 'refs/heads/main'"

# Rule 14: the workflows that upload the erasure-list key as a Worker secret.
ERASURE_KEY_WORKFLOWS = {"staging-deploy.yml", "production-deploy.yml"}

# Rule 15: environments where a Worker may have a route before authentication exists.
UNAUTHENTICATED_ROUTE_ENVIRONMENTS = {"local", "preview"}
ROUTE_KEYS = ("route", "routes")

# Rule 15: Workers that may have a route because every request is authenticated, with the
# ADR that says how. Adding one is a reviewed change of this code-owned file (ADR 0123).
AUTHENTICATED_ROUTES = {
    # Cloudflare Access in front, and the Worker verifies the Access token on every API
    # request and refuses all requests while unconfigured (REQ-REV-005).
    "apps/review/wrangler.toml": "ADR 0116",
}

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
        run_trigger = (workflow.get("on", workflow.get(True, {})) or {})
        if "workflow_run" in events:
            if not isinstance(run_trigger, dict) or run_trigger["workflow_run"].get("branches") != ["main"]:
                fail(f"{name}: limit `workflow_run` to `branches: [main]`")
        for job_name, job in (workflow.get("jobs") or {}).items():
            if "environment" in job:
                if MAIN_GUARD not in str(job.get("if", "")):
                    fail(f"{name}: job {job_name} uses an environment; add `if: {MAIN_GUARD}`")
                if any("secrets." in str(value) for value in (job.get("env") or {}).values()):
                    fail(
                        f"{name}: job {job_name} uses an environment; move secrets from the job "
                        "`env` to the steps that need them"
                    )
            if job.get("secrets") == "inherit":
                fail(f"{name}: job {job_name} must not pass `secrets: inherit`")
            called = job.get("uses")
            if isinstance(called, str) and called.startswith("./.github/workflows/"):
                target = ROOT / called[2:].split("@")[0]
                target_jobs = (yaml.safe_load(target.read_text()) or {}).get("jobs") or {} if target.is_file() else {}
                if any("environment" in (called_job or {}) for called_job in target_jobs.values()):
                    fail(
                        f"{name}: job {job_name} calls {target.name}, which uses an environment; "
                        "its secrets would be empty, so start it with `gh workflow run`"
                    )
            for index, step in enumerate(job.get("steps") or []):
                if "ERASURE_HASH_KEY" in json.dumps(step) and name not in ERASURE_KEY_WORKFLOWS:
                    fail(
                        f"{name}: job {job_name}, step {index + 1} reads ERASURE_HASH_KEY; only "
                        "the deploy workflows may (ADR 0123)"
                    )
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


def wrangler_configs() -> list[pathlib.Path]:
    """Every Wrangler configuration of the repository: the pipeline's and each app's (ADR 0115)."""
    found = {ROOT / "infrastructure" / "cloudflare" / "wrangler.toml"}
    for pattern in ("apps/*/wrangler.toml", "infrastructure/*/wrangler.toml"):
        found.update(ROOT.glob(pattern))
    return sorted(found)


def check_wrangler() -> None:
    for path in wrangler_configs():
        name = path.as_posix()
        if not path.is_file():
            fail(f"{name}: missing")
            continue
        text = path.read_text()
        for key in ("workers_dev", "preview_urls"):
            top = re.search(rf"^{key}\s*=\s*(\w+)", text, re.M)
            if not top or top.group(1) != "false":
                fail(f"{name}: set `{key} = false` at the top level")
            if re.search(rf"^\s*{key}\s*=\s*true", text, re.M):
                fail(f"{name}: `{key} = true` is not allowed")


def wrangler_configs() -> list[pathlib.Path]:
    return sorted(
        [ROOT / "infrastructure" / "cloudflare" / "wrangler.toml"]
        + list((ROOT / "apps").glob("*/wrangler.toml"))
    )


def check_routes() -> None:
    for path in wrangler_configs():
        if not path.is_file() or path.as_posix() in AUTHENTICATED_ROUTES:
            continue
        config = tomllib.loads(path.read_text())
        # Top-level keys are what an environment without its own value inherits.
        sections = {"(top level)": config}
        for env_name, env in (config.get("env") or {}).items():
            if env_name not in UNAUTHENTICATED_ROUTE_ENVIRONMENTS:
                sections[f"env.{env_name}"] = env
        for where, section in sections.items():
            for key in ROUTE_KEYS:
                if key in section:
                    fail(
                        f"{path.as_posix()}: `{key}` in {where} exposes a Worker without "
                        "authentication; routes are allowed only in local and preview, or for a "
                        "Worker listed in AUTHENTICATED_ROUTES (ADR 0123)"
                    )


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
    check_routes()
    check_audit()
    if errors:
        for error in errors:
            print(f"hardening error: {error}")
        sys.exit(1)
    print(
        f"hardening ok: {len(WORKFLOWS)} workflows, dependabot, CODEOWNERS, wrangler, routes, audit"
    )


main()
