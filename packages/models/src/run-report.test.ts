import { describe, expect, it } from "vitest";

import { AlertTypeSchema, RunReportSchema } from "./run-report.js";

const report = {
  RunId: "run_1",
  Source: "openalex",
  Status: "partial",
  StartedAt: "2026-10-30T06:00:00.000Z",
  EndedAt: "2026-10-30T06:05:00.000Z",
  WindowFrom: "2026-09-30",
  PagesDone: 2,
  Counts: { Fetched: 3, Created: 2, Updated: 0, Skipped: 0, Failed: 1, DeadLettered: 0 },
  Failures: [{ SourceId: "W1", Reason: "UNIQUE constraint failed" }],
  DeadLetteredMessages: [],
  DataQuality: { IncompleteRecords: 1, DuplicatesFlagged: 0, FailedPdfs: 0 },
};

describe("REQ-NFR-008: run report contract", () => {
  it("REQ-NFR-008: accepts a report with counts, failed items, and data-quality counters", () => {
    expect(RunReportSchema.parse(report).Counts.Failed).toBe(1);
  });

  it("REQ-NFR-008: rejects a report without counts", () => {
    const { Counts: _omitted, ...withoutCounts } = report;
    expect(() => RunReportSchema.parse(withoutCounts)).toThrow();
  });
});

describe("REQ-NFR-019: alert types", () => {
  it("REQ-NFR-019: names the five events of the requirement", () => {
    expect(AlertTypeSchema.options).toEqual([
      "failed-run",
      "run-timeout",
      "dead-letter",
      "budget-stop",
      "availability-breach",
    ]);
  });
});
