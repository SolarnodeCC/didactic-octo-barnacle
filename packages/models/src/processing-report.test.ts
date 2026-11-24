import { describe, expect, it } from "vitest";

import { ProcessingReportSchema } from "./processing-report.js";

const REPORT = {
  RunId: "prun_1",
  Kind: "daily",
  Day: "2026-10-29",
  Status: "succeeded",
  StartedAt: "2026-10-29T06:00:00.000Z",
  EndedAt: "2026-10-30T11:00:00.000Z",
  Counts: { Triaged: 3 },
  Failures: [],
  Budget: { Limit: 1.25, Spent: 0.0048, StoppedAt: null },
  Cost: {
    Currency: "EUR",
    Total: 0.0048,
    ByStep: [{ Step: "triage", Calls: 4, Items: 3, Cost: 0.0004 }],
    EstimatedShare: 0.5,
    Publications: 3,
    CostPerPublication: 0.0016,
    Opportunities: 0,
    CostPerOpportunity: null,
  },
  Quality: null,
};

describe("REQ-NFR-005: the processing run report", () => {
  it("REQ-NFR-005: AC3 holds the cost per publication and a null cost per opportunity without candidates", () => {
    expect(ProcessingReportSchema.parse(REPORT)).toEqual(REPORT);
  });

  it("REQ-NFR-008: AC2 accepts counts and amounts only, so no text field can be added", () => {
    expect(() => ProcessingReportSchema.parse({ ...REPORT, Abstract: "text" })).toThrow();
    expect(() =>
      ProcessingReportSchema.parse({ ...REPORT, Cost: { ...REPORT.Cost, Total: -1 } }),
    ).toThrow();
  });
});
