import { describe, expect, it } from "vitest";

import type { LookupReport } from "./lookup.js";
import { applySubfieldChanges, formatSyncPlan, planSubfieldSync } from "./sync.js";

function report(topics: LookupReport["Topics"]): LookupReport {
  return {
    FromDate: "2026-08-03",
    Days: 90,
    Topics: topics,
    Volume: [],
    ExactSubfieldIds: [],
    MatchingWorks: null,
  };
}

function subfield(id: string, name: string, exact = true) {
  return { Id: id, Name: name, Level: "subfield" as const, WorksCount: null, Exact: exact };
}

describe("REQ-DATA-001: OpenAlex subfield ID sync", () => {
  const current = { Software: "1712", Finance: "2003" };

  it("REQ-DATA-001: a changed exact ID is planned, an unchanged one is not", () => {
    const plan = planSubfieldSync(
      report([
        { TopicName: "Software", Candidates: [subfield("1799", "Software")] },
        { TopicName: "Finance", Candidates: [subfield("2003", "Finance")] },
      ]),
      current,
    );
    expect(plan.Changes).toEqual([{ Name: "Software", From: "1712", To: "1799" }]);
    expect(plan.Skipped).toEqual([]);
  });

  it("REQ-DATA-001: no or several exact matches are skipped for a human", () => {
    const plan = planSubfieldSync(
      report([
        { TopicName: "Software", Candidates: [subfield("1799", "Software", false)] },
        {
          TopicName: "Finance",
          Candidates: [subfield("2003", "Finance"), subfield("2004", "Finance")],
        },
      ]),
      current,
    );
    expect(plan.Changes).toEqual([]);
    expect(plan.Skipped.map((s) => s.Name)).toEqual(["Software", "Finance"]);
  });

  it("REQ-DATA-001: a name that is not in the map is never added", () => {
    const plan = planSubfieldSync(
      report([{ TopicName: "Law", Candidates: [subfield("3308", "Law")] }]),
      current,
    );
    expect(plan.Changes).toEqual([]);
  });

  it("REQ-DATA-001: only the changed entry is rewritten in the source", () => {
    const source = 'export const X = {\n  Finance: "2003",\n  "Food Science": "1106",\n};\n';
    const out = applySubfieldChanges(source, [{ Name: "Food Science", From: "1106", To: "1107" }]);
    expect(out).toBe('export const X = {\n  Finance: "2003",\n  "Food Science": "1107",\n};\n');
    expect(() =>
      applySubfieldChanges(source, [{ Name: "Finance", From: "9999", To: "1" }]),
    ).toThrow(/not found/);
  });

  it("REQ-DATA-001: the summary says when nothing changed", () => {
    expect(formatSyncPlan({ Changes: [], Skipped: [] })).toContain("No subfield ID changed.");
  });
});
