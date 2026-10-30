import { describe, expect, it } from "vitest";

import { windowStart } from "./window.js";

const base = { Today: "2026-10-30", OverlapDays: 2, BackfillDays: 30 };

describe("REQ-DATA-009: ingestion window", () => {
  it("REQ-DATA-009: a first run backfills the configured number of days", () => {
    expect(windowStart({ ...base, LastWindowEnd: null })).toBe("2026-09-30");
  });

  it("REQ-DATA-009: a later run starts at the last window end minus the overlap", () => {
    expect(windowStart({ ...base, LastWindowEnd: "2026-10-29" })).toBe("2026-10-27");
  });

  it("REQ-DATA-009: the overlap crosses a month boundary correctly", () => {
    expect(windowStart({ ...base, Today: "2026-03-01", LastWindowEnd: "2026-03-01" })).toBe(
      "2026-02-27",
    );
  });

  it("REQ-DATA-009: a long gap never reaches back further than the backfill window", () => {
    expect(windowStart({ ...base, LastWindowEnd: "2026-06-01" })).toBe("2026-09-30");
  });
});
