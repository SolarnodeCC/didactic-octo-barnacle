"""Tests for scripts/check-kt.py (REQ-NFR-004)."""

from __future__ import annotations

import unittest

from support import ScriptTestCase

GLOSSARY = "docs/kt/glossary.md"
TESTING = "docs/kt/requirements/testing.md"
ROADMAP = "docs/kt/roadmap.md"


class KtTest(ScriptTestCase):
    SCRIPT = "check-kt.py"
    PATHS = ("docs/kt",)

    def test_req_nfr_004_passes_on_the_repository(self) -> None:
        result = self.assert_passes()
        self.assertIn("kt ok", result.stdout)

    def test_req_nfr_004_fails_on_missing_frontmatter(self) -> None:
        text = self.read(GLOSSARY)
        self.write(GLOSSARY, text[text.index("# Glossary") :])
        self.assert_fails_with("glossary.md: missing frontmatter")

    def test_req_nfr_004_fails_on_a_missing_frontmatter_key(self) -> None:
        self.replace(GLOSSARY, 'owner: "@SolarnodeCC"\n', "")
        self.assert_fails_with("glossary.md: frontmatter is missing owner")

    def test_req_nfr_004_fails_on_an_unknown_document_status(self) -> None:
        self.replace(GLOSSARY, "status: approved", "status: final")
        self.assert_fails_with("glossary.md: status must be one of")

    def test_req_nfr_004_fails_on_a_broken_relative_link(self) -> None:
        self.replace(GLOSSARY, "(agents/README.md)", "(agents/MISSING.md)")
        self.assert_fails_with("glossary.md: broken link agents/MISSING.md")

    def test_req_nfr_004_ignores_links_inside_code_fences(self) -> None:
        self.write(GLOSSARY, self.read(GLOSSARY) + "\n```text\n[x](missing.md)\n```\n")
        self.assert_passes()

    def test_req_nfr_004_fails_on_a_file_over_the_line_limit(self) -> None:
        self.write(GLOSSARY, self.read(GLOSSARY) + "\n" * 400)
        self.assert_fails_with("limit is 400 lines and 25600 bytes, split it")

    def test_req_nfr_004_fails_when_an_index_does_not_link_a_file(self) -> None:
        self.write("docs/kt/test/unlisted.md", self.read("docs/kt/test/levels.md"))
        self.assert_fails_with("docs/kt/test/README.md: does not link unlisted.md")

    def test_req_nfr_004_fails_on_a_directory_without_an_index(self) -> None:
        self.write("docs/kt/newdir/page.md", self.read("docs/kt/test/levels.md"))
        self.assert_fails_with("docs/kt/newdir: missing README.md index")

    def test_req_nfr_004_fails_on_a_requirement_without_a_field(self) -> None:
        self.replace(TESTING, "- Source: test strategy\n", "")
        self.assert_fails_with("REQ-TEST-001 is missing '- Source:'")

    def test_req_nfr_004_fails_on_an_unknown_requirement_status(self) -> None:
        self.replace(TESTING, "- Status: done", "- Status: started")
        self.assert_fails_with("REQ-TEST-001 Status must be one of")

    def test_req_nfr_004_fails_on_a_malformed_requirement_heading(self) -> None:
        self.replace(TESTING, "### REQ-TEST-001: Traceability", "### REQ-TEST-1: Traceability")
        self.assert_fails_with("heading is not 'REQ-<AREA>-<NNN>: <title>'")

    def test_req_nfr_004_fails_on_a_duplicate_requirement_id(self) -> None:
        self.replace(TESTING, "### REQ-TEST-002:", "### REQ-TEST-001:")
        self.assert_fails_with("REQ-TEST-001 is already defined in")

    def test_req_nfr_004_fails_on_a_reference_to_an_undefined_requirement(self) -> None:
        self.write(GLOSSARY, self.read(GLOSSARY) + "\nSee REQ-TEST-999.\n")
        self.assert_fails_with("glossary.md: REQ-TEST-999 is not defined")

    def test_req_nfr_004_fails_on_a_dependency_in_a_later_phase(self) -> None:
        self.replace(
            "docs/kt/requirements/processing.md",
            "- Depends on: REQ-PROC-008, REQ-TEST-002, REQ-NFR-005",
            "- Depends on: REQ-PROC-008, REQ-AGENT-009, REQ-NFR-005",
        )
        self.assert_fails_with("REQ-PROC-010 (phase 2) depends on REQ-AGENT-009 in a later phase (3)")

    def test_req_nfr_004_fails_when_the_roadmap_list_differs_from_the_phase_field(self) -> None:
        self.replace(ROADMAP, ", REQ-AGENT-016,", ",")
        self.assert_fails_with("REQ-AGENT-016 (phase 3) is missing from Requirements per phase")

    def test_req_nfr_004_fails_when_the_roadmap_lists_a_requirement_in_another_phase(self) -> None:
        self.replace(ROADMAP, ", REQ-REV-008 |", " |")
        self.replace(ROADMAP, ", REQ-REV-009,", ", REQ-REV-008, REQ-REV-009,")
        self.assert_fails_with("REQ-REV-008 is listed in phase 3 but its Phase field is 2")


if __name__ == "__main__":
    unittest.main()
