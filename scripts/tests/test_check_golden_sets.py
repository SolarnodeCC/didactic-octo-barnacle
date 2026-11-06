"""Tests for scripts/check-golden-sets.py (REQ-TEST-005)."""

from __future__ import annotations

import unittest

from support import ScriptTestCase

EXT = "agents/extraction/evals"
TRIAGE_REJECTED = f"{EXT}/triage/gs-triage-001.yaml"
TRIAGE_ACCEPTED = f"{EXT}/triage/gs-triage-002.yaml"
EXTRACTION = f"{EXT}/extraction/gs-extraction-001.yaml"
ANALYST = "agents/analysis/evals/research-analyst/gs-research-analyst-001.yaml"


class GoldenSetsTest(ScriptTestCase):
    SCRIPT = "check-golden-sets.py"
    PATHS = ("agents",)

    def test_req_test_005_passes_on_the_repository(self) -> None:
        result = self.assert_passes()
        self.assertIn("golden sets ok", result.stdout)

    def test_req_test_005_fails_on_an_id_that_differs_from_the_file_name(self) -> None:
        self.replace(TRIAGE_REJECTED, "id: gs-triage-001", "id: gs-triage-901")
        self.assert_fails_with("gs-triage-001.yaml: id 'gs-triage-901' does not match the file name")

    def test_req_test_005_fails_on_a_missing_fixture(self) -> None:
        self.replace(TRIAGE_REJECTED, "fixtures/arxiv/2610.40649.json", "fixtures/arxiv/0000.00000.json")
        self.assert_fails_with("fixture not found")

    def test_req_test_005_fails_when_accepted_does_not_follow_the_triage_rule(self) -> None:
        self.replace(TRIAGE_ACCEPTED, "accepted: true", "accepted: false")
        self.assert_fails_with("gs-triage-002.yaml: accepted is False but the signals give True")

    def test_req_test_005_fails_on_a_true_signal_without_a_basis(self) -> None:
        self.replace(TRIAGE_REJECTED, "trigger: false", "trigger: true")
        self.assert_fails_with("gs-triage-001.yaml: trigger is true but its basis is empty or 'none'")

    def test_req_test_005_fails_on_a_quote_that_is_not_verbatim(self) -> None:
        self.replace(EXTRACTION, 'evidenceQuote: "Extreme weather', 'evidenceQuote: "Severe weather')
        self.assert_fails_with("gs-extraction-001.yaml: candidate 0: evidenceQuote is not verbatim in the fixture")

    def test_req_test_005_fails_when_an_industry_has_no_extraction_entry(self) -> None:
        for number in ("035", "036"):
            self.replace(f"{EXT}/extraction/gs-extraction-{number}.yaml", "industry: insurance", "industry: other")
        self.assert_fails_with("no extraction entry for industry insurance")

    def test_req_test_005_fails_on_an_unknown_industry(self) -> None:
        self.replace(EXTRACTION, "industry: public-sector", "industry: farming")
        self.assert_fails_with("industry 'farming' is not one of the eight industries or 'other'")

    def test_req_test_005_fails_on_a_range_that_is_too_wide(self) -> None:
        self.replace(ANALYST, "noveltyRange: [40, 70]", "noveltyRange: [10, 70]")
        self.assert_fails_with("noveltyRange [10, 70] is wider than 30")

    def test_req_test_005_fails_on_an_unknown_maturity(self) -> None:
        self.replace(ANALYST, "  maturity: prototype\n  industriesInclude", "  maturity: alpha\n  industriesInclude")
        self.assert_fails_with("maturity 'alpha' is not valid")

    def test_req_test_005_fails_on_a_candidate_reference_that_points_nowhere(self) -> None:
        self.replace(ANALYST, "gs-extraction-001.yaml#0", "gs-extraction-001.yaml#9")
        self.assert_fails_with("does not point to a candidate")


if __name__ == "__main__":
    unittest.main()
