"""Tests for scripts/check-hardening.py (REQ-NFR-021)."""

from __future__ import annotations

import json
import unittest

from support import ScriptTestCase

CI = ".github/workflows/ci.yml"


class HardeningTest(ScriptTestCase):
    SCRIPT = "check-hardening.py"
    PATHS = (".github", "infrastructure/cloudflare/wrangler.toml", "package.json")

    def test_req_nfr_021_passes_on_the_repository(self) -> None:
        result = self.assert_passes()
        self.assertIn("hardening ok", result.stdout)

    def test_req_nfr_021_fails_on_an_action_pinned_to_a_tag(self) -> None:
        text = self.read(CI)
        start = text.index("actions/checkout@") + len("actions/checkout@")
        self.write(CI, text[:start] + "v4 # tag" + text[text.index("\n", start) :])
        self.assert_fails_with("pin `actions/checkout@v4` to a full commit SHA")

    def test_req_nfr_021_fails_when_checkout_keeps_credentials(self) -> None:
        self.replace(CI, "persist-credentials: false", "persist-credentials: true")
        self.assert_fails_with("actions/checkout needs `persist-credentials: false`")

    def test_req_nfr_021_fails_without_top_level_permissions(self) -> None:
        self.replace(CI, "permissions:\n  contents: read\n", "")
        self.assert_fails_with("ci.yml: set `permissions` at the top level")

    def test_req_nfr_021_fails_on_pull_request_target(self) -> None:
        self.replace(CI, "  pull_request:\n", "  pull_request_target:\n")
        self.assert_fails_with("ci.yml: pull_request_target is not allowed")

    def test_req_nfr_021_fails_on_a_secret_in_a_pull_request_workflow(self) -> None:
        self.replace(CI, "run: pnpm lint", "run: pnpm lint ${{ secrets.TOKEN }}")
        self.assert_fails_with("a workflow that runs on pull_request must not use secrets")

    def test_req_nfr_021_fails_on_event_data_in_a_run_script(self) -> None:
        self.replace(CI, "run: pnpm lint", 'run: echo "${{ github.event.pull_request.title }}"')
        self.assert_fails_with("pass event data or inputs through `env`, not into `run`")

    def test_req_nfr_021_fails_on_a_call_to_a_workflow_that_uses_an_environment(self) -> None:
        self.write(
            ".github/workflows/caller.yml",
            "name: Caller\non:\n  workflow_dispatch:\npermissions:\n  contents: read\n"
            "jobs:\n  deploy:\n    uses: ./.github/workflows/staging-deploy.yml\n",
        )
        self.assert_fails_with(
            "caller.yml: job deploy calls staging-deploy.yml, which uses an environment"
        )

    def test_req_nfr_021_fails_when_dependabot_drops_an_ecosystem(self) -> None:
        self.replace(".github/dependabot.yml", "package-ecosystem: npm", "package-ecosystem: cargo")
        self.assert_fails_with("dependabot.yml: add the `npm` ecosystem")

    def test_req_nfr_021_fails_without_a_default_code_owner(self) -> None:
        lines = self.read(".github/CODEOWNERS").splitlines()
        self.write(".github/CODEOWNERS", "\n".join(l for l in lines if not l.startswith("*")) + "\n")
        self.assert_fails_with("CODEOWNERS: add a default owner line")

    def test_req_nfr_021_fails_when_wrangler_turns_on_workers_dev(self) -> None:
        self.replace("infrastructure/cloudflare/wrangler.toml", "workers_dev = false", "workers_dev = true")
        self.assert_fails_with("wrangler.toml: `workers_dev = true` is not allowed")

    def test_req_nfr_021_fails_without_the_audit_script(self) -> None:
        package = json.loads(self.read("package.json"))
        del package["scripts"]["audit:ci"]
        self.write("package.json", json.dumps(package))
        self.assert_fails_with("package.json: add the `audit:ci` script")


if __name__ == "__main__":
    unittest.main()
