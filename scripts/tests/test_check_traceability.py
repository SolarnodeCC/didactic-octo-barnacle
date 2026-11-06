"""Tests for scripts/check-traceability.py (REQ-TEST-001).

Run from the repository root: python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile
import textwrap
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "check-traceability.py"
_spec = importlib.util.spec_from_file_location("check_traceability", SCRIPT)
assert _spec and _spec.loader
traceability = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = traceability
_spec.loader.exec_module(traceability)


REQUIREMENTS = textwrap.dedent(
    """\
    # Data

    ### REQ-DATA-001: Done and tested

    - Status: done

    ### REQ-DATA-002: Done and reviewed

    - Status: done

    ### REQ-DATA-003: In progress

    - Status: in-progress

    ### REQ-DATA-004: Planned

    - Status: planned
    """
)


class TraceabilityTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._tmp.name)
        self.write("docs/kt/requirements/data.md", REQUIREMENTS)
        self.write("docs/kt/requirements/README.md", "### REQ-IGNORED-001: index\n- Status: done\n")
        self.write(
            "docs/kt/test/named-reviews.md",
            "| REQ-ID | Verification |\n|---|---|\n| REQ-DATA-002 | review |\n",
        )
        self.write(
            "pkg/src/a.test.ts",
            'describe("REQ-DATA-001: block", () => { it("REQ-DATA-001: case", () => {}); });\n',
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, relative: str, text: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_req_test_001_passes_when_every_done_requirement_is_covered(self) -> None:
        result = traceability.check(self.root)

        self.assertEqual(result.errors, [])
        self.assertEqual(result.stats["done requirements"], 2)
        self.assertEqual(result.stats["covered done requirements"], 2)
        self.assertEqual(result.stats["tests scanned"], 2)

    def test_req_test_001_fails_on_a_done_requirement_without_coverage(self) -> None:
        self.write("docs/kt/test/named-reviews.md", "| REQ-ID | Verification |\n")

        result = traceability.check(self.root)

        self.assertEqual(
            result.errors,
            ["REQ-DATA-002 has status done but no test or named review covers it"],
        )

    def test_req_test_001_fails_on_a_test_that_names_an_undefined_requirement(self) -> None:
        self.write("pkg/src/b.int.test.ts", 'it("REQ-DATA-099: typo in the ID", () => {});\n')

        result = traceability.check(self.root)

        self.assertEqual(len(result.errors), 1)
        self.assertIn("REQ-DATA-099, which no requirement defines", result.errors[0])
        self.assertIn("b.int.test.ts", result.errors[0])

    def test_req_test_001_fails_on_a_named_review_of_an_undefined_requirement(self) -> None:
        self.write(
            "docs/kt/test/named-reviews.md",
            "| REQ-DATA-002 | review |\n| REQ-DATA-077 | review |\n",
        )

        result = traceability.check(self.root)

        self.assertEqual(result.errors, ["named review REQ-DATA-077 is not a defined requirement"])

    def test_req_test_001_warns_on_uncovered_in_progress_and_untraced_tests(self) -> None:
        self.write("pkg/src/c.test.ts", 'it("helper without an ID", () => {});\n')

        result = traceability.check(self.root)

        self.assertEqual(result.errors, [])
        self.assertIn(
            "REQ-DATA-003 is in-progress and no test or named review covers it yet",
            result.warnings,
        )
        self.assertTrue(any("untraced test" in w for w in result.warnings))
        self.assertFalse(any("REQ-DATA-004" in w for w in result.warnings))

    def test_req_test_001_does_not_count_calls_that_end_in_it_as_tests(self) -> None:
        self.write(
            "pkg/src/f.test.ts",
            'it("REQ-DATA-001: splits", () => { const parts = "a,b".split(","); });\n',
        )

        result = traceability.check(self.root)

        self.assertEqual(result.stats["tests scanned"], 3)
        self.assertFalse(any("untraced test" in w for w in result.warnings))

    def test_req_test_001_skips_node_modules_and_build_output(self) -> None:
        self.write("node_modules/x/src/d.test.ts", 'it("REQ-DATA-999: vendored", () => {});\n')
        self.write("pkg/dist/e.test.ts", 'it("REQ-DATA-998: built", () => {});\n')

        result = traceability.check(self.root)

        self.assertEqual(result.errors, [])
        self.assertEqual(result.stats["tests scanned"], 2)


if __name__ == "__main__":
    unittest.main()
