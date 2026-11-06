"""Record one OpenAlex work or one arXiv entry as a test fixture (REQ-TEST-003).

Run from the repository root, by hand, never in CI:

    python3 scripts/record-fixture.py openalex W4400000000 --case work-retracted
    python3 scripts/record-fixture.py arxiv 2410.00001 --case feed-two-versions

It writes apps/pipeline/src/fixtures/openalex/<case>.json or
apps/pipeline/src/fixtures/arxiv/<case>.xml. Tests read fixtures, so recording is
the only step that reaches a live API (docs/kt/test/test-data.md).

What it keeps and what it scrubs:

- An OpenAlex work keeps only the fields the collector reads (the keys of
  `OpenAlexWork` in apps/pipeline/src/collectors/openalex/types.ts).
- An arXiv entry is written as a one-entry Atom feed, the format the collector parses.
- Authors are pseudonymised by default: names become "Author 1", "Author 2", ...,
  OpenAlex author IDs become synthetic IDs, and ORCIDs and affiliations become
  placeholders (REQ-NFR-009, REQ-NFR-016). Pass --keep-author-names only when a test
  needs the real public names; author IDs, ORCIDs, and affiliations are replaced in any case.
- Request headers are never written. The OpenAlex key is read from the
  OPENALEX_API_KEY environment variable and sent only as a request header.

Refresh fixtures in a separate pull request and say why in it.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Callable

FIXTURES = pathlib.Path("apps/pipeline/src/fixtures")
OPENALEX_WORK_URL = "https://api.openalex.org/works/{id}"
ARXIV_QUERY_URL = "https://export.arxiv.org/api/query?{query}"
USER_AGENT = "roi-fixture-recorder"
TIMEOUT_SECONDS = 30

OPENALEX_KEYS = (
    "id",
    "title",
    "display_name",
    "publication_date",
    "doi",
    "ids",
    "abstract_inverted_index",
    "authorships",
    "topics",
    "primary_topic",
    "cited_by_count",
    "language",
    "is_retracted",
    "open_access",
    "primary_location",
)
OPENALEX_IDS = ("openalex", "doi", "doi_url", "arxiv")
OPENALEX_OPEN_ACCESS = ("is_oa", "oa_url", "any_repository_has_fulltext")
OPENALEX_LOCATION = ("license", "pdf_url", "landing_page_url")
TOPIC_KEYS = ("id", "display_name", "subfield", "field", "domain")

ATOM = "http://www.w3.org/2005/Atom"
ARXIV = "http://arxiv.org/schemas/atom"
OPENALEX_ID = re.compile(r"^W\d+$")
ARXIV_ID = re.compile(r"^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?/\d{7})(v\d+)?$")
CASE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

Fetch = Callable[[str, dict[str, str]], bytes]


def http_fetch(url: str, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return response.read()


def _pick(source: Any, keys: tuple[str, ...]) -> Any:
    if not isinstance(source, dict):
        return source
    return {key: source[key] for key in keys if key in source}


def _topic(topic: Any) -> Any:
    if not isinstance(topic, dict):
        return topic
    kept = _pick(topic, TOPIC_KEYS)
    for level in ("subfield", "field", "domain"):
        if isinstance(kept.get(level), dict):
            kept[level] = _pick(kept[level], ("id", "display_name"))
    return kept


def scrub_authorships(authorships: Any, keep_names: bool) -> list[dict[str, Any]]:
    """Pseudonymise authors; ORCIDs and institutions never survive."""
    scrubbed: list[dict[str, Any]] = []
    for number, authorship in enumerate(authorships or [], start=1):
        if not isinstance(authorship, dict):
            continue
        author = authorship.get("author") or {}
        name = author.get("display_name") if keep_names else None
        entry: dict[str, Any] = {
            "author": {
                "id": f"https://openalex.org/A{900000000 + number}",
                "display_name": name or f"Author {number}",
                "orcid": None,
            },
            "institutions": [
                {"display_name": f"Institution {number}.{index}"}
                for index, _ in enumerate(authorship.get("institutions") or [], start=1)
            ],
        }
        if "author_position" in authorship:
            entry = {"author_position": authorship["author_position"], **entry}
        scrubbed.append(entry)
    return scrubbed


def trim_openalex_work(work: dict[str, Any], keep_names: bool = False) -> dict[str, Any]:
    trimmed = _pick(work, OPENALEX_KEYS)
    if "ids" in trimmed:
        trimmed["ids"] = _pick(trimmed["ids"], OPENALEX_IDS)
    if "open_access" in trimmed:
        trimmed["open_access"] = _pick(trimmed["open_access"], OPENALEX_OPEN_ACCESS)
    if isinstance(trimmed.get("primary_location"), dict):
        trimmed["primary_location"] = _pick(trimmed["primary_location"], OPENALEX_LOCATION)
    if "topics" in trimmed:
        trimmed["topics"] = [_topic(topic) for topic in trimmed["topics"] or []]
    if "primary_topic" in trimmed:
        trimmed["primary_topic"] = _topic(trimmed["primary_topic"])
    if "authorships" in trimmed:
        trimmed["authorships"] = scrub_authorships(trimmed["authorships"], keep_names)
    return trimmed


def scrub_arxiv_feed(xml_text: bytes, keep_names: bool = False) -> str:
    """The first entry of an arXiv Atom response, as a one-entry feed."""
    ET.register_namespace("", ATOM)
    ET.register_namespace("arxiv", ARXIV)
    root = ET.fromstring(xml_text)
    entry = root.find(f"{{{ATOM}}}entry")
    if entry is None or entry.find(f"{{{ATOM}}}title") is None:
        raise ValueError("the arXiv response has no entry")
    for number, author in enumerate(entry.findall(f"{{{ATOM}}}author"), start=1):
        name = author.find(f"{{{ATOM}}}name")
        if name is not None and not keep_names:
            name.text = f"Author {number}"
        for index, affiliation in enumerate(author.findall(f"{{{ARXIV}}}affiliation"), start=1):
            affiliation.text = f"Institution {number}.{index}"
    feed = ET.Element(f"{{{ATOM}}}feed")
    title = ET.SubElement(feed, f"{{{ATOM}}}title")
    title.text = "ArXiv Query"
    feed.append(entry)
    ET.indent(feed, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(feed, encoding="unicode") + "\n"


def record_openalex(work_id: str, keep_names: bool, fetch: Fetch) -> str:
    if not OPENALEX_ID.match(work_id):
        raise ValueError(f"not an OpenAlex work ID: {work_id!r} (expected W followed by digits)")
    headers = {"accept": "application/json", "user-agent": USER_AGENT}
    api_key = os.environ.get("OPENALEX_API_KEY")
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"
    body = fetch(OPENALEX_WORK_URL.format(id=work_id), headers)
    work = json.loads(body)
    return json.dumps(trim_openalex_work(work, keep_names), indent=2, ensure_ascii=False) + "\n"


def record_arxiv(arxiv_id: str, keep_names: bool, fetch: Fetch) -> str:
    if not ARXIV_ID.match(arxiv_id):
        raise ValueError(f"not an arXiv ID: {arxiv_id!r}")
    query = urllib.parse.urlencode({"id_list": arxiv_id, "max_results": "1"})
    body = fetch(ARXIV_QUERY_URL.format(query=query), {"user-agent": USER_AGENT})
    return scrub_arxiv_feed(body, keep_names)


def main(argv: list[str] | None = None, fetch: Fetch = http_fetch, root: pathlib.Path = pathlib.Path(".")) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("source", choices=("openalex", "arxiv"))
    parser.add_argument("id", help="an OpenAlex work ID (W...) or an arXiv ID (2410.00001)")
    parser.add_argument("--case", required=True, help="fixture name in kebab-case, without extension")
    parser.add_argument("--keep-author-names", action="store_true", help="keep real public author names")
    parser.add_argument("--force", action="store_true", help="overwrite an existing fixture")
    args = parser.parse_args(argv)

    if not CASE.match(args.case):
        parser.error(f"--case must be kebab-case: {args.case!r}")
    extension = "json" if args.source == "openalex" else "xml"
    target = root / FIXTURES / args.source / f"{args.case}.{extension}"
    if target.exists() and not args.force:
        print(f"error: {target} exists; pass --force to refresh it", file=sys.stderr)
        return 1

    try:
        record = record_openalex if args.source == "openalex" else record_arxiv
        text = record(args.id, args.keep_author_names, fetch)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"recorded {target}")
    print("Check the file before committing, and say in the pull request why it was recorded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
