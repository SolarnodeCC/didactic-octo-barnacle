"""Tests for scripts/check-config.py.

No requirement defines the configuration check; it is a repository convention in
AGENTS.md, so these tests name no REQ-ID (allowed by REQ-TEST-001 AC1).
"""

from __future__ import annotations

import unittest

from support import ScriptTestCase

RULE = ".cursor/rules/mdc.mdc"


class ConfigTest(ScriptTestCase):
    SCRIPT = "check-config.py"
    PATHS = (".github", ".cursor", "package.json")

    def test_passes_on_the_repository_configuration(self) -> None:
        result = self.assert_passes()
        self.assertIn("mdc ok", result.stdout)

    def test_fails_on_json_with_a_trailing_comma(self) -> None:
        self.write("broken.json", '{"a": 1,}\n')
        self.assert_fails_with("JSONDecodeError")

    def test_fails_on_invalid_yaml(self) -> None:
        self.write("broken.yaml", "key: [unclosed\n")
        self.assert_fails_with("yaml.parser.ParserError")

    def test_skips_node_modules_and_the_lockfile(self) -> None:
        self.write("node_modules/pkg/broken.json", "{")
        self.write("pnpm-lock.yaml", "key: [unclosed\n")
        self.assert_passes()

    def test_fails_on_a_rule_without_always_apply(self) -> None:
        text = self.read(RULE)
        self.write(RULE, "\n".join(l for l in text.splitlines() if not l.startswith("alwaysApply:")) + "\n")
        self.assert_fails_with("mdc.mdc is missing alwaysApply:")


if __name__ == "__main__":
    unittest.main()
