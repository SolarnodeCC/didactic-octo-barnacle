"""Tests for scripts/check-golden-sets.py (REQ-TEST-005)."""

from __future__ import annotations

import importlib.util
import json
import unittest

from support import REPO, ScriptTestCase

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

    def test_req_agent_008_passes_on_a_quote_that_differs_only_in_typography(self) -> None:
        self.replace(
            EXTRACTION,
            'evidenceQuote: "Extreme weather is forecast days ahead,',
            'evidenceQuote: "Extreme  weather is forecast days\u00a0ahead,',
        )
        self.assert_passes()

    def test_req_test_005_fails_when_an_industry_has_no_extraction_entry(self) -> None:
        for number in ("035", "036"):
            self.replace(f"{EXT}/extraction/gs-extraction-{number}.yaml", "industry: insurance", "industry: other")
        self.assert_fails_with("no extraction entry for industry insurance")

    def test_req_test_005_fails_on_an_unknown_industry(self) -> None:
        self.replace(EXTRACTION, "industry: public-sector", "industry: farming")
        self.assert_fails_with("industry 'farming' is not one of the eight industries or 'other'")

    def test_req_test_007_passes_on_a_triage_entry_with_a_known_industry(self) -> None:
        self.replace(TRIAGE_REJECTED, "industry: other", "industry: life-sciences")
        self.assert_passes()

    def test_req_test_007_fails_on_a_triage_entry_with_an_unknown_industry(self) -> None:
        self.replace(TRIAGE_REJECTED, "industry: other", "industry: farming")
        self.assert_fails_with("gs-triage-001.yaml: industry 'farming' is not one of the eight industries or 'other'")

    def test_req_test_007_fails_on_a_triage_entry_without_an_industry(self) -> None:
        self.replace(TRIAGE_REJECTED, "industry: other\n", "")
        self.assert_fails_with("gs-triage-001.yaml: industry is missing")

    def test_req_test_007_fails_when_an_industry_has_no_triage_entry(self) -> None:
        for number in ("084", "085", "086", "087"):
            self.replace(f"{EXT}/triage/gs-triage-{number}.yaml", "industry: insurance", "industry: other")
        self.assert_fails_with("no triage entry for industry insurance")

    def test_req_test_005_fails_on_a_range_that_is_too_wide(self) -> None:
        self.replace(ANALYST, "noveltyRange: [50, 80]", "noveltyRange: [10, 80]")
        self.assert_fails_with("noveltyRange [10, 80] is wider than 30")

    def test_req_test_005_fails_on_an_unknown_maturity(self) -> None:
        self.replace(ANALYST, "  maturity: prototype\n  industriesInclude", "  maturity: alpha\n  industriesInclude")
        self.assert_fails_with("maturity 'alpha' is not valid")

    def test_req_test_005_fails_on_a_candidate_reference_that_points_nowhere(self) -> None:
        self.replace(ANALYST, "gs-extraction-001.yaml#0", "gs-extraction-001.yaml#9")
        self.assert_fails_with("does not point to a candidate")


class QuoteNormalisationTest(unittest.TestCase):
    """The Python mirror equals normalizeForQuote on the shared cases (ADR 0064)."""

    def test_req_agent_008_matches_the_typescript_cases(self) -> None:
        spec = importlib.util.spec_from_file_location("check_golden_sets", REPO / "scripts/check-golden-sets.py")
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        cases = json.loads((REPO / "packages/models/test-fixtures/quote-normalisation.json").read_text(encoding="utf-8"))
        for case in cases["normalize"]:
            self.assertEqual(module.normalize_for_quote(case["input"]), case["expected"], case["input"])
        for case in cases["spans"]:
            self.assertEqual(module.quote_occurs(case["text"], case["quote"]), case["span"] is not None, case["quote"])


if __name__ == "__main__":
    unittest.main()
