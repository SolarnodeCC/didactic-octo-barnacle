"""Tests for scripts/record-fixture.py (REQ-TEST-003, REQ-NFR-009).

The recorder is the one tool that reaches a live API, so these tests inject a fake
fetch and never call the network.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "record-fixture.py"
_spec = importlib.util.spec_from_file_location("record_fixture", SCRIPT)
assert _spec and _spec.loader
recorder = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = recorder
_spec.loader.exec_module(recorder)

WORK = {
    "id": "https://openalex.org/W123",
    "title": "A work",
    "publication_date": "2026-10-01",
    "relevance_score": 1.5,
    "referenced_works": ["https://openalex.org/W1"],
    "ids": {"openalex": "https://openalex.org/W123", "mag": "999", "pmid": "1"},
    "abstract_inverted_index": {"Agents": [0], "help.": [1]},
    "authorships": [
        {
            "author_position": "first",
            "author": {
                "id": "https://openalex.org/A5000000001",
                "display_name": "Real Person",
                "orcid": "https://orcid.org/0000-0002-1111-2222",
            },
            "institutions": [{"display_name": "Real University", "ror": "https://ror.org/x"}],
            "raw_affiliation_strings": ["Real University, Real City"],
        }
    ],
    "topics": [
        {
            "id": "https://openalex.org/T1",
            "display_name": "Topic",
            "score": 0.9,
            "subfield": {"id": "https://openalex.org/subfields/1702", "display_name": "AI"},
        }
    ],
    "primary_location": {"license": "cc-by", "pdf_url": None, "source": {"id": "S1"}},
}

FEED = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>ArXiv Query: id_list=2410.00001</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2410.00001v2</id>
    <title>Agents</title>
    <summary>We study agents.</summary>
    <author><name>Real Person</name><arxiv:affiliation>Real University</arxiv:affiliation></author>
    <author><name>Second Person</name></author>
    <arxiv:primary_category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>
"""


class FakeFetch:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> bytes:
        self.calls.append((url, headers))
        return self.body


class TrimTest(unittest.TestCase):
    def test_req_test_003_keeps_only_the_fields_the_collector_reads(self) -> None:
        trimmed = recorder.trim_openalex_work(WORK)

        self.assertNotIn("relevance_score", trimmed)
        self.assertNotIn("referenced_works", trimmed)
        self.assertEqual(trimmed["ids"], {"openalex": "https://openalex.org/W123"})
        self.assertNotIn("score", trimmed["topics"][0])
        self.assertEqual(trimmed["topics"][0]["subfield"]["id"], "https://openalex.org/subfields/1702")
        self.assertEqual(trimmed["primary_location"], {"license": "cc-by", "pdf_url": None})

    def test_req_nfr_009_pseudonymises_authors_by_default(self) -> None:
        text = json.dumps(recorder.trim_openalex_work(WORK))

        for real in ("Real Person", "0000-0002-1111-2222", "Real University", "A5000000001", "Real City"):
            self.assertNotIn(real, text)
        authorship = json.loads(text)["authorships"][0]
        self.assertEqual(authorship["author_position"], "first")
        self.assertEqual(authorship["author"]["display_name"], "Author 1")
        self.assertIsNone(authorship["author"]["orcid"])
        self.assertEqual(authorship["institutions"], [{"display_name": "Institution 1.1"}])

    def test_req_nfr_009_keep_author_names_still_drops_orcid_and_affiliation(self) -> None:
        text = json.dumps(recorder.trim_openalex_work(WORK, keep_names=True))

        self.assertIn("Real Person", text)
        self.assertNotIn("0000-0002-1111-2222", text)
        self.assertNotIn("Real University", text)

    def test_req_nfr_009_arxiv_feed_keeps_one_entry_and_scrubs_authors(self) -> None:
        text = recorder.scrub_arxiv_feed(FEED)

        self.assertIn("<title>Agents</title>", text)
        self.assertIn("<name>Author 1</name>", text)
        self.assertIn("<name>Author 2</name>", text)
        self.assertIn("<arxiv:affiliation>Institution 1.1</arxiv:affiliation>", text)
        self.assertNotIn("Real", text)
        self.assertNotIn("opensearch", text)
        self.assertTrue(text.startswith('<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"'))

    def test_req_test_003_arxiv_response_without_an_entry_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            recorder.scrub_arxiv_feed(b'<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>')


class MainTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_main(self, argv: list[str], fetch: FakeFetch) -> int:
        with mock.patch("sys.stdout"), mock.patch("sys.stderr"):
            return recorder.main(argv, fetch=fetch, root=self.root)

    def test_req_test_003_records_an_openalex_work_and_keeps_the_key_out_of_the_file(self) -> None:
        fetch = FakeFetch(json.dumps(WORK).encode())
        with mock.patch.dict(os.environ, {"OPENALEX_API_KEY": "dummy-test-key"}):
            code = self.run_main(["openalex", "W123", "--case", "work-example"], fetch)

        self.assertEqual(code, 0)
        url, headers = fetch.calls[0]
        self.assertEqual(url, "https://api.openalex.org/works/W123")
        self.assertEqual(headers["authorization"], "Bearer dummy-test-key")
        text = (self.root / "apps/pipeline/src/fixtures/openalex/work-example.json").read_text()
        self.assertNotIn("dummy-test-key", text)
        self.assertEqual(json.loads(text)["id"], "https://openalex.org/W123")

    def test_req_test_003_records_an_arxiv_entry_as_a_feed(self) -> None:
        fetch = FakeFetch(FEED)
        code = self.run_main(["arxiv", "2410.00001", "--case", "feed-example"], fetch)

        self.assertEqual(code, 0)
        self.assertIn("id_list=2410.00001", fetch.calls[0][0])
        self.assertTrue((self.root / "apps/pipeline/src/fixtures/arxiv/feed-example.xml").is_file())

    def test_req_test_003_refuses_to_overwrite_without_force(self) -> None:
        target = self.root / "apps/pipeline/src/fixtures/openalex/work-example.json"
        target.parent.mkdir(parents=True)
        target.write_text("{}")
        fetch = FakeFetch(json.dumps(WORK).encode())

        self.assertEqual(self.run_main(["openalex", "W123", "--case", "work-example"], fetch), 1)
        self.assertEqual(fetch.calls, [])
        self.assertEqual(self.run_main(["openalex", "W123", "--case", "work-example", "--force"], fetch), 0)

    def test_req_test_003_rejects_malformed_ids_before_any_request(self) -> None:
        fetch = FakeFetch(b"")

        self.assertEqual(self.run_main(["openalex", "../../etc", "--case", "x"], fetch), 1)
        self.assertEqual(self.run_main(["arxiv", "2410.1 OR all:x", "--case", "x"], fetch), 1)
        self.assertEqual(fetch.calls, [])

    def test_req_test_003_records_an_empty_openalex_page_with_only_meta_and_results(self) -> None:
        page = {"meta": {"count": 0, "next_cursor": None, "db_response_time_ms": 2, "x_query": {}}, "results": []}
        fetch = FakeFetch(json.dumps(page).encode())

        self.assertEqual(self.run_main(["openalex-empty", "--case", "page-empty"], fetch), 0)
        self.assertIn("from_publication_date:2099-01-01", fetch.calls[0][0])
        self.assertIn("cursor=*", fetch.calls[0][0])
        recorded = json.loads((self.root / "apps/pipeline/src/fixtures/openalex/page-empty.json").read_text())
        self.assertEqual(recorded, {"meta": {"count": 0, "next_cursor": None}, "results": []})

    def test_req_test_003_records_an_empty_arxiv_feed_with_its_result_count(self) -> None:
        empty = (
            b'<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">'
            b"<id>https://arxiv.org/api/x</id><title>q</title>"
            b"<opensearch:totalResults>0</opensearch:totalResults></feed>"
        )
        fetch = FakeFetch(empty)

        self.assertEqual(self.run_main(["arxiv-empty", "--case", "feed-empty"], fetch), 0)
        self.assertIn("submittedDate", fetch.calls[0][0])
        text = (self.root / "apps/pipeline/src/fixtures/arxiv/feed-empty.xml").read_text()
        self.assertIn("<opensearch:totalResults>0</opensearch:totalResults>", text)
        self.assertNotIn("<entry", text)
        self.assertNotIn("arxiv.org/api/x", text)

    def test_req_test_003_empty_modes_refuse_a_response_that_has_results(self) -> None:
        self.assertEqual(self.run_main(["openalex-empty", "--case", "x"], FakeFetch(json.dumps({"results": [WORK]}).encode())), 1)
        self.assertEqual(self.run_main(["arxiv-empty", "--case", "x"], FakeFetch(FEED)), 1)
        self.assertFalse((self.root / "apps/pipeline/src/fixtures").exists())

    def test_req_test_003_an_id_is_required_for_a_record_and_refused_for_an_empty_page(self) -> None:
        with self.assertRaises(SystemExit):
            self.run_main(["openalex", "--case", "x"], FakeFetch(b""))
        with self.assertRaises(SystemExit):
            self.run_main(["arxiv-empty", "2410.00001", "--case", "x"], FakeFetch(b""))

    def test_req_test_003_rejects_a_case_name_that_is_not_kebab_case(self) -> None:
        with self.assertRaises(SystemExit):
            self.run_main(["openalex", "W123", "--case", "../escape"], FakeFetch(b""))


if __name__ == "__main__":
    unittest.main()
