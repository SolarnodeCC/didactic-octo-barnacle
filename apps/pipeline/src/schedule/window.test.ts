import { describe, expect, it } from "vitest";

import { earliestWindowStart, windowStart } from "./window.js";

const base = { Today: "2026-10-30", OverlapDays: 2, BackfillDays: 14, MaxAgeDays: 90 };

describe("REQ-DATA-009: ingestion window", () => {
  it("REQ-DATA-009: a first run backfills the configured number of days", () => {
    expect(windowStart({ ...base, LastWindowEnd: null })).toBe("2026-10-16");
  });

  it("REQ-DATA-009: a first run never reaches back further than the storage limit", () => {
    expect(windowStart({ ...base, BackfillDays: 120, LastWindowEnd: null })).toBe("2026-08-01");
  });

  it("REQ-DATA-009: a later run starts at the last window end minus the overlap", () => {
    expect(windowStart({ ...base, LastWindowEnd: "2026-10-29" })).toBe("2026-10-27");
  });

  it("REQ-DATA-009: the overlap crosses a month boundary correctly", () => {
    expect(windowStart({ ...base, Today: "2026-03-01", LastWindowEnd: "2026-03-01" })).toBe(
      "2026-02-27",
    );
  });

  it("REQ-DATA-009: a gap longer than the backfill is still covered, up to the storage limit", () => {
    expect(windowStart({ ...base, LastWindowEnd: "2026-09-30" })).toBe("2026-09-28");
    expect(windowStart({ ...base, LastWindowEnd: "2026-06-01" })).toBe("2026-08-01");
  });

  it("REQ-DATA-009: no window starts more than 90 days before the day of the run", () => {
    expect(earliestWindowStart("2026-10-30", 90)).toBe("2026-08-01");
    for (const lastWindowEnd of [null, "2026-01-01", "2026-08-01", "2026-10-29"]) {
      const start = windowStart({ ...base, LastWindowEnd: lastWindowEnd });
      expect(start >= earliestWindowStart(base.Today, base.MaxAgeDays)).toBe(true);
    }
  });
});
