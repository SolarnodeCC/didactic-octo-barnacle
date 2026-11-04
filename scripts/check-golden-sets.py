#!/usr/bin/env python3
"""Check the golden sets under agents/*/evals (REQ-TEST-005).

Paths in analysis entries are relative to agents/analysis/evals; paths in triage and extraction entries are relative to agents/extraction/evals.

Checks references, verbatim extraction quotes, the triage rule, range widths, enums, and the coverage of
the eight target industries. It reads files only and never calls a model.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "agents/extraction/evals"
ANA = ROOT / "agents/analysis/evals"
INDUSTRIES = [
    "automotive", "aerospace-defense", "consumer-retail", "energy-utilities",
    "banking", "insurance", "public-sector", "life-sciences",
]
EXTRACTION_INDUSTRIES = INDUSTRIES + ["other"]
MATURITY = {"theoretical", "lab-result", "prototype", "field-tested"}
EFFORT = {"S", "M", "L", "XL"}
SIGNALS = ["namedParty", "statedHarm", "trigger", "existingAlternative", "adoptable"]
ACCEPT_SCORE_CUT = 0.55  # triage.accept_score_cut, docs/kt/agents/triage.md
MIN_ENTRIES = 20
MIN_EMPTY_EXTRACTIONS = 3

errors: list[str] = []


def err(path: Path, message: str) -> None:
    errors.append(f"{path.relative_to(ROOT)}: {message}")


def load(path: Path):
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        err(path, f"invalid YAML: {exc}")
        return None


def fixture_text(path: Path, fixture: Path) -> str | None:
    if not fixture.is_file():
        err(path, f"fixture not found: {fixture.relative_to(ROOT) if ROOT in fixture.parents else fixture}")
        return None
    data = json.loads(fixture.read_text(encoding="utf-8"))
    return f"{data.get('title', '')} {data.get('summary', '')}"


def check_id(path: Path, entry: dict) -> None:
    if entry.get("id") != path.stem:
        err(path, f"id {entry.get('id')!r} does not match the file name")


def check_range(path: Path, name: str, value, low: int, high: int, width: int) -> None:
    ok = isinstance(value, list) and len(value) == 2 and all(isinstance(v, int) for v in value)
    if not ok:
        err(path, f"{name} must be a list of two integers")
        return
    if not (low <= value[0] <= value[1] <= high):
        err(path, f"{name} {value} is outside {low}..{high} or reversed")
    elif value[1] - value[0] > width:
        err(path, f"{name} {value} is wider than {width}")


def triage() -> dict[str, dict]:
    accepted: dict[str, dict] = {}
    files = sorted((EXT / "triage").glob("gs-triage-*.yaml"))
    for path in files:
        entry = load(path)
        if not isinstance(entry, dict):
            continue
        check_id(path, entry)
        fixture = (EXT / entry["publicationFixture"]).resolve()
        text = fixture_text(path, fixture)
        signals = entry["expected"]["signals"]
        if set(signals) != set(SIGNALS):
            err(path, "signals must be exactly " + ", ".join(SIGNALS))
            continue
        score = sum(1 for s in SIGNALS if signals[s]) / 5
        expect = bool(signals["namedParty"] and signals["statedHarm"] and score >= ACCEPT_SCORE_CUT)
        if entry["expected"]["accepted"] != expect:
            err(path, f"accepted is {entry['expected']['accepted']} but the signals give {expect}")
        if entry["expected"]["reason"] != ("accepted" if expect else "low-score"):
            err(path, "reason does not follow from accepted")
        for name in SIGNALS:
            basis = str(entry.get("basis", {}).get(name, ""))
            if signals[name]:
                if basis.startswith("none") or not basis:
                    err(path, f"{name} is true but its basis is empty or 'none'")
            elif not basis.startswith("none"):
                err(path, f"{name} is false but its basis does not start with 'none'")
        if expect:
            accepted[fixture.name] = entry
    if len(files) < MIN_ENTRIES:
        err(EXT / "triage", f"{len(files)} entries, minimum {MIN_ENTRIES}")
    return accepted


def extraction(accepted: dict[str, dict]) -> dict[str, tuple[Path, list]]:
    candidates: dict[str, tuple[Path, list]] = {}
    files = sorted((EXT / "extraction").glob("gs-extraction-*.yaml"))
    seen_fixtures: set[str] = set()
    empties = 0
    industries: dict[str, int] = {}
    for path in files:
        entry = load(path)
        if not isinstance(entry, dict):
            continue
        check_id(path, entry)
        fixture = (EXT / entry["publicationFixture"]).resolve()
        text = fixture_text(path, fixture)
        seen_fixtures.add(fixture.name)
        if fixture.name not in accepted:
            err(path, "its publication has no accepted triage entry")
        industry = entry.get("industry")
        if industry not in EXTRACTION_INDUSTRIES:
            err(path, f"industry {industry!r} is not one of the eight industries or 'other'")
        industries[industry] = industries.get(industry, 0) + 1
        cands = entry["expected"]["candidates"]
        if not cands:
            empties += 1
            if not entry["expected"].get("reason"):
                err(path, "an empty candidate list needs a reason")
        for i, cand in enumerate(cands):
            for key in ("evidenceQuote", "customerQuote", "whyNowQuote", "alternativeQuote"):
                quote = cand.get(key)
                if quote is not None and text is not None and quote not in text:
                    err(path, f"candidate {i}: {key} is not verbatim in the fixture")
            for key in ("finding", "evidenceQuote", "customer", "customerQuote"):
                if not cand.get(key):
                    err(path, f"candidate {i}: {key} is missing")
            if (cand.get("whyNow") is None) != (cand.get("whyNowQuote") is None):
                err(path, f"candidate {i}: whyNow and whyNowQuote must both be set or both be null")
            if (cand.get("currentAlternative") is None) != (cand.get("alternativeQuote") is None):
                err(path, f"candidate {i}: currentAlternative and alternativeQuote must both be set or both be null")
        candidates[path.name] = (path, cands)
    for name in accepted:
        if name not in seen_fixtures:
            err(EXT / "extraction", f"accepted triage publication {name} has no extraction entry")
    if len(files) < MIN_ENTRIES:
        err(EXT / "extraction", f"{len(files)} entries, minimum {MIN_ENTRIES}")
    if empties < MIN_EMPTY_EXTRACTIONS:
        err(EXT / "extraction", f"{empties} entries without candidate, minimum {MIN_EMPTY_EXTRACTIONS}")
    for industry in INDUSTRIES:
        if industries.get(industry, 0) < 1:
            err(EXT / "extraction", f"no extraction entry for industry {industry}")
    return candidates


def resolve_candidate(path: Path, entry: dict, candidates: dict[str, tuple[Path, list]]) -> None:
    ref = str(entry.get("candidateRef", ""))
    file_part, _, index = ref.partition("#")
    name = Path(file_part).name
    if name not in candidates or not index.isdigit() or int(index) >= len(candidates[name][1]):
        err(path, f"candidateRef {ref!r} does not point to a candidate")
    elif (ANA / file_part).resolve() != candidates[name][0].resolve():
        err(path, f"candidateRef {ref!r} does not resolve to the extraction entry")


def analysis(candidates: dict[str, tuple[Path, list]]) -> None:
    sets = {
        "research-analyst": {}, "problem-discovery": {}, "relevance": {},
    }
    industries = {k: set() for k in sets}
    for kind in sets:
        files = sorted((ANA / kind).glob(f"gs-{kind}-*.yaml"))
        for path in files:
            entry = load(path)
            if not isinstance(entry, dict):
                continue
            check_id(path, entry)
            sets[kind][path.name] = entry
            if not (ANA / entry["publicationFixture"]).resolve().is_file():
                err(path, "publicationFixture not found")
            resolve_candidate(path, entry, candidates)
            exp = entry["expected"]
            if kind == "research-analyst":
                check_range(path, "noveltyRange", exp.get("noveltyRange"), 0, 100, 30)
                if exp.get("maturity") not in MATURITY:
                    err(path, f"maturity {exp.get('maturity')!r} is not valid")
                if not (ANA / entry["neighborsFixture"]).is_file():
                    err(path, "neighborsFixture not found")
                for value in exp.get("industriesInclude", []) + entry["handoff"]["industry"]:
                    if value not in EXTRACTION_INDUSTRIES:
                        err(path, f"industry {value!r} is not valid")
                industries[kind].update(exp.get("industriesInclude", []))
                handoff = entry["handoff"]
                lo, hi = exp["noveltyRange"]
                if not lo <= handoff["novelty"] <= hi:
                    err(path, "handoff novelty is outside noveltyRange")
                if handoff["maturity"] != exp["maturity"]:
                    err(path, "handoff maturity differs from the expected maturity")
                if not 1 <= len(handoff["technology"]) <= 5:
                    err(path, "handoff technology needs 1 to 5 items")
            elif kind == "problem-discovery":
                check_range(path, "painLevelRange", exp.get("painLevelRange"), 1, 5, 2)
                if exp.get("customerIndustry") not in EXTRACTION_INDUSTRIES:
                    err(path, "customerIndustry is not valid")
                industries[kind].add(exp.get("customerIndustry"))
                if len(exp.get("requiredFacts", [])) < 1:
                    err(path, "requiredFacts is empty")
            else:
                check_range(path, "strategicRelevanceRange", exp.get("strategicRelevanceRange"), 0, 100, 30)
                check_range(path, "technicalFeasibilityRange", exp.get("technicalFeasibilityRange"), 0, 100, 30)
                if exp.get("implementationEffort") not in EFFORT:
                    err(path, "implementationEffort is not valid")
                if exp.get("bestIndustry") not in INDUSTRIES:
                    err(path, "bestIndustry must be one of the eight industries")
                industries[kind].add(exp.get("bestIndustry"))
            for ref_key in ("researchAnalystRef", "problemDiscoveryRef"):
                if ref_key in entry and not (ANA / entry[ref_key]).resolve().is_file():
                    err(path, f"{ref_key} not found")
        if len(files) < MIN_ENTRIES:
            err(ANA / kind, f"{len(files)} entries, minimum {MIN_ENTRIES}")
        for industry in INDUSTRIES:
            if industry not in industries[kind]:
                err(ANA / kind, f"no entry for industry {industry}")


def main() -> int:
    accepted = triage()
    candidates = extraction(accepted)
    analysis(candidates)
    if errors:
        print("\n".join(errors))
        print(f"golden sets: {len(errors)} problem(s)")
        return 1
    print(f"golden sets ok: {len(accepted)} accepted publications, {len(candidates)} extraction entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
