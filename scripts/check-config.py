"""Parse the repository's JSON, YAML, and Cursor rule files.

Run from the repository root: python3 scripts/check-config.py
"""

import json
import pathlib
import sys

import yaml

SKIP_DIRS = {".git", "node_modules", "dist", "coverage", ".wrangler"}
SKIP_YAML_NAMES = {"pnpm-lock.yaml"}

root = pathlib.Path(".")


def keep(path: pathlib.Path) -> bool:
    return not SKIP_DIRS.intersection(path.parts)


json_files = [p for p in root.rglob("*.json") if keep(p)]
yaml_files = [
    p
    for p in list(root.rglob("*.yml")) + list(root.rglob("*.yaml"))
    if keep(p) and p.name not in SKIP_YAML_NAMES
]
mdc_files = list(root.glob(".cursor/rules/*.mdc"))
if not json_files or not yaml_files or not mdc_files:
    sys.exit("expected json, yaml, and mdc files")
for path in json_files:
    json.loads(path.read_text())
    print(f"json ok {path}")
for path in yaml_files:
    yaml.safe_load(path.read_text())
    print(f"yaml ok {path}")
for path in mdc_files:
    text = path.read_text()
    if not text.startswith("---\n"):
        sys.exit(f"{path} is missing frontmatter")
    end = text.find("\n---\n", 4)
    if end == -1:
        sys.exit(f"{path} frontmatter does not close")
    front = text[4:end]
    for key in ("description:", "alwaysApply:"):
        if key not in front:
            sys.exit(f"{path} is missing {key}")
    print(f"mdc ok {path}")
