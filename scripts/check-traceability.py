"""Check that tests name REQ-IDs and that done requirements have coverage.

Run from the repository root: python3 scripts/check-traceability.py

Implements the CI gate for REQ-TEST-001:

- Errors: a requirement with status done that no test name or description and no
  row in docs/kt/test/named-reviews.md covers; a REQ-ID in a test name or a named
  review that no requirement file defines.
- Warnings: tests without a REQ-ID, and in-progress requirements that nothing
  covers yet, so the gap is visible before they move to done.
"""

from __future__ import annotations

import pathlib
import re
import sys
from dataclasses import dataclass, field

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


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)


def requirement_statuses(root: pathlib.Path) -> dict[str, str]:
    """Every REQ-ID defined under docs/kt/requirements, with its status."""
    statuses: dict[str, str] = {}
    requirements = root / "docs" / "kt" / "requirements"
    for path in sorted(requirements.rglob("*.md")):
        if path.name == "README.md":
            continue
        text = path.read_text()
        for match in REQ_HEADING.finditer(text):
            rest = text[match.end() :]
            next_heading = REQ_HEADING.search(rest)
            block = rest if next_heading is None else rest[: next_heading.start()]
            status_match = REQ_STATUS.search(block)
            statuses[match.group(1)] = status_match.group(1) if status_match else "unknown"
    return statuses


def named_review_ids(root: pathlib.Path) -> set[str]:
    reviews = root / "docs" / "kt" / "test" / "named-reviews.md"
    if not reviews.is_file():
        return set()
    return set(REVIEW_ROW.findall(reviews.read_text()))


def collect_test_files(root: pathlib.Path) -> list[pathlib.Path]:
    files: set[pathlib.Path] = set()
    for pattern in TEST_GLOBS:
        for path in root.rglob(pattern):
            if SKIP_DIRS.intersection(path.relative_to(root).parts):
                continue
            files.add(path)
    return sorted(files)


def check(root: pathlib.Path) -> Result:
    result = Result()
    statuses = requirement_statuses(root)
    defined = set(statuses)
    reviews = named_review_ids(root)
    covered: set[str] = set(reviews)
    untraced = 0
    test_count = 0

    for review_id in sorted(reviews - defined):
        result.errors.append(f"named review {review_id} is not a defined requirement")

    for path in collect_test_files(root):
        relative = path.relative_to(root)
        text = path.read_text()
        for match in TEST_NAME.finditer(text):
            test_count += 1
            name = match.group(2)
            ids = REQ_ID.findall(name)
            if not ids:
                untraced += 1
                result.warnings.append(f"untraced test in {relative}: {name[:80]}")
            for req_id in ids:
                if req_id not in defined:
                    result.errors.append(
                        f"{relative}: test names {req_id}, which no requirement defines"
                    )
            covered.update(ids)

    done = {req for req, status in statuses.items() if status == "done"}
    in_progress = {req for req, status in statuses.items() if status == "in-progress"}

    for req_id in sorted(done - covered):
        result.errors.append(f"{req_id} has status done but no test or named review covers it")
    for req_id in sorted(in_progress - covered):
        result.warnings.append(f"{req_id} is in-progress and no test or named review covers it yet")

    result.stats = {
        "tests scanned": test_count,
        "done requirements": len(done),
        "covered done requirements": len(done & covered),
        "in-progress requirements": len(in_progress),
        "covered in-progress requirements": len(in_progress & covered),
        "named reviews": len(reviews),
        "untraced tests": untraced,
    }
    return result


def main() -> int:
    result = check(pathlib.Path("."))
    for name, value in result.stats.items():
        print(f"{name}={value}")
    for warning in result.warnings:
        print(f"warning: {warning}")
    for error in result.errors:
        print(f"error: {error}")
    return 1 if result.errors else 0


if __name__ == "__main__":
    sys.exit(main())
