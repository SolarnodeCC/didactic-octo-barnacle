"""Check that tests name REQ-IDs and that done requirements have coverage.

Run from the repository root: python3 scripts/check-traceability.py

Implements the CI gate for REQ-TEST-001. Requirements with status done must
appear in at least one test name or description, or in docs/kt/test/named-reviews.md.
Tests without a REQ-ID are reported as untraced (warning only).
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(".")
REQUIREMENTS = ROOT / "docs" / "kt" / "requirements"
NAMED_REVIEWS = ROOT / "docs" / "kt" / "test" / "named-reviews.md"
TEST_GLOBS = ("**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx")
SKIP_DIRS = {".git", "node_modules", "dist", "coverage", ".wrangler"}

REQ_HEADING = re.compile(r"^### (REQ-[A-Z]+-\d{3}):", re.M)
REQ_STATUS = re.compile(r"^- Status:\s*(\S+)", re.M)
REQ_ID = re.compile(r"\bREQ-[A-Z]+-\d{3}\b")
TEST_NAME = re.compile(
    r"""(?:it|test|describe)\s*\(\s*(['"`])(.*?)\1""",
    re.S,
)
REVIEW_ROW = re.compile(r"^\|\s*(REQ-[A-Z]+-\d{3})\s*\|", re.M)

errors: list[str] = []
warnings: list[str] = []


def iter_requirement_files() -> list[pathlib.Path]:
    return sorted(p for p in REQUIREMENTS.rglob("*.md") if p.name != "README.md")


def done_requirement_ids() -> set[str]:
    done: set[str] = set()
    for path in iter_requirement_files():
        text = path.read_text()
        for match in REQ_HEADING.finditer(text):
            req_id = match.group(1)
            rest = text[match.end() :]
            next_heading = REQ_HEADING.search(rest)
            block = rest if next_heading is None else rest[: next_heading.start()]
            status_match = REQ_STATUS.search(block)
            if status_match and status_match.group(1) == "done":
                done.add(req_id)
    return done


def named_review_ids() -> set[str]:
    if not NAMED_REVIEWS.is_file():
        return set()
    return set(REVIEW_ROW.findall(NAMED_REVIEWS.read_text()))


def collect_test_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for pattern in TEST_GLOBS:
        for path in ROOT.rglob(pattern):
            if SKIP_DIRS.intersection(path.parts):
                continue
            files.append(path)
    return sorted(files)


def main() -> int:
    done = done_requirement_ids()
    covered: set[str] = set(named_review_ids())
    untraced = 0
    test_count = 0

    for path in collect_test_files():
        text = path.read_text()
        for match in TEST_NAME.finditer(text):
            test_count += 1
            name = match.group(2)
            ids = REQ_ID.findall(name)
            if not ids:
                untraced += 1
                warnings.append(f"untraced test in {path}: {name[:80]}")
            covered.update(ids)

    missing = sorted(done - covered)
    for req_id in missing:
        errors.append(
            f"{req_id} has status done but no test or named review covers it"
        )

    print(f"tests scanned={test_count}")
    print(f"done requirements={len(done)}")
    print(f"covered done requirements={len(done & covered)}")
    print(f"named reviews={len(named_review_ids())}")
    print(f"untraced tests={untraced}")

    for warning in warnings:
        print(f"warning: {warning}")
    for error in errors:
        print(f"error: {error}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
