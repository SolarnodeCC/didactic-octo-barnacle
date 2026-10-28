"""Check the knowledge transfer (KT) documents in docs/kt.

Run from the repository root: python3 scripts/check-kt.py

Checks frontmatter, file size limits, the directory indexes, relative links,
and the format and uniqueness of requirement IDs. Warnings do not fail the run.
"""

import datetime
import pathlib
import re
import sys

import yaml

KT = pathlib.Path("docs/kt")
REQUIREMENTS = KT / "requirements"

WARN_LINES = 250
MAX_LINES = 400
MAX_BYTES = 25 * 1024
WARN_REQS = 25
MAX_REQS = 40
REVIEW_DAYS = 90

DOC_KEYS = ("title", "owner", "status", "last_reviewed")
DOC_STATUS = {"draft", "approved", "deprecated"}
REQ_FIELDS = ("Phase", "Priority", "Status", "Source", "Acceptance criteria", "Verification")
REQ_VALUES = {
    "Phase": {"1", "2", "3", "4", "later"},
    "Priority": {"must", "should", "could"},
    "Status": {"planned", "in-progress", "done", "dropped"},
}

REQ_ID = re.compile(r"\bREQ-[A-Z]+-\d{3}\b")
REQ_HEADING = re.compile(r"^### (REQ-[A-Z]+-\d{3}): \S.*$", re.M)
FIELD = re.compile(r"^- ([A-Za-z ]+):[ \t]*(.*)$", re.M)
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
FENCE = re.compile(r"^```.*?^```[ \t]*$", re.M | re.S)

errors = []
warnings = []


def split_frontmatter(path, text):
    if not text.startswith("---\n"):
        errors.append(f"{path}: missing frontmatter")
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        errors.append(f"{path}: frontmatter does not close")
        return {}, text
    front = yaml.safe_load(text[4:end]) or {}
    if not isinstance(front, dict):
        errors.append(f"{path}: frontmatter is not a mapping")
        return {}, text[end + 5 :]
    return front, text[end + 5 :]


def check_frontmatter(path, front):
    for key in DOC_KEYS:
        if key not in front:
            errors.append(f"{path}: frontmatter is missing {key}")
    if "status" in front and front["status"] not in DOC_STATUS:
        errors.append(f"{path}: status must be one of {sorted(DOC_STATUS)}")
    reviewed = front.get("last_reviewed")
    if "last_reviewed" in front and not isinstance(reviewed, datetime.date):
        errors.append(f"{path}: last_reviewed must be a YYYY-MM-DD date")
    elif isinstance(reviewed, datetime.date):
        age = (datetime.date.today() - reviewed).days
        if age > REVIEW_DAYS:
            warnings.append(f"{path}: last reviewed {age} days ago")
    related = front.get("related", [])
    if not isinstance(related, list):
        errors.append(f"{path}: related must be a list")
        related = []
    return [str(item) for item in related]


def check_size(path, text):
    lines = text.count("\n") + 1
    size = len(text.encode())
    if lines > MAX_LINES or size > MAX_BYTES:
        errors.append(f"{path}: {lines} lines, {size} bytes; limit is {MAX_LINES} lines and {MAX_BYTES} bytes, split it")
    elif lines > WARN_LINES:
        warnings.append(f"{path}: {lines} lines; split before it reaches {MAX_LINES}")


def check_links(path, body):
    targets = set()
    for target in LINK.findall(body):
        if re.match(r"^[a-z]+:", target) or target.startswith("#"):
            continue
        resolved = (path.parent / target.split("#", 1)[0]).resolve()
        if not resolved.exists():
            errors.append(f"{path}: broken link {target}")
        targets.add(resolved)
    return targets


def check_requirements(path, body):
    found = []
    for line in re.findall(r"^### .*$", body, re.M):
        if not REQ_HEADING.match(line):
            errors.append(f"{path}: heading is not 'REQ-<AREA>-<NNN>: <title>': {line}")
    matches = list(REQ_HEADING.finditer(body))
    for index, match in enumerate(matches):
        req = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        section = re.split(r"^## ", body[match.end() : end], maxsplit=1, flags=re.M)[0]
        fields = dict(FIELD.findall(section))
        for name in REQ_FIELDS:
            if name not in fields:
                errors.append(f"{path}: {req} is missing '- {name}:'")
        for name, allowed in REQ_VALUES.items():
            if name in fields and fields[name].strip() not in allowed:
                errors.append(f"{path}: {req} {name} must be one of {sorted(allowed)}")
        if not re.search(r"^\s+1\. \S", section, re.M):
            errors.append(f"{path}: {req} has no numbered acceptance criteria")
        found.append(req)
    if len(found) > MAX_REQS:
        errors.append(f"{path}: {len(found)} requirements; limit is {MAX_REQS}, split it")
    elif len(found) > WARN_REQS:
        warnings.append(f"{path}: {len(found)} requirements; split before it reaches {MAX_REQS}")
    return found


def main():
    if not (KT / "README.md").is_file():
        sys.exit(f"{KT}/README.md is missing")

    defined = {}
    referenced = []
    links = {}

    files = sorted(p for p in KT.rglob("*") if p.is_file())
    for path in files:
        text = path.read_text()
        check_size(path, text)
        if path.suffix != ".md":
            continue
        front, body = split_frontmatter(path, text)
        related = check_frontmatter(path, front)
        body = FENCE.sub("", body)
        links[path] = check_links(path, body)
        referenced += [(path, req) for req in related + REQ_ID.findall(body)]
        if REQUIREMENTS in path.parents and path.name != "README.md":
            for req in check_requirements(path, body):
                if req in defined:
                    errors.append(f"{path}: {req} is already defined in {defined[req]}")
                defined.setdefault(req, path)

    for path, req in referenced:
        if req not in defined:
            errors.append(f"{path}: {req} is not defined in {REQUIREMENTS}")

    for directory in [KT] + sorted(p for p in KT.rglob("*") if p.is_dir()):
        index = directory / "README.md"
        if not index.is_file():
            errors.append(f"{directory}: missing README.md index")
            continue
        listed = links.get(index, set())
        for child in sorted(directory.iterdir()):
            if child == index:
                continue
            wanted = {child.resolve(), (child / "README.md").resolve()}
            if not wanted & listed:
                errors.append(f"{index}: does not link {child.name}")

    for message in warnings:
        print(f"warning: {message}")
    for message in errors:
        print(f"error: {message}")
    if errors:
        sys.exit(1)
    print(f"kt ok {len(files)} files, {len(defined)} requirements")


main()
