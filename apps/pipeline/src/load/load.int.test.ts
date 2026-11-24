import { describe, expect, it } from "vitest";

import { LARGEST_MEASURED_DAY, runLoad } from "./run-load.js";

describe("REQ-NFR-010: load test at the largest measured day (ADR 0118)", () => {
  it("REQ-NFR-010: AC1 AC2 4,634 publications are ingested and triaged before admission, and the daily limit is extracted within 24 hours", async () => {
    const report = await runLoad();
    expect(report.Publications).toBe(LARGEST_MEASURED_DAY);
    expect(report.Counts).toMatchObject({
      Ingested: LARGEST_MEASURED_DAY,
      Triaged: LARGEST_MEASURED_DAY,
      Embedded: LARGEST_MEASURED_DAY,
      Admitted: 100,
      Extracted: 100,
      RedriveRows: 0,
    });
    // Triage is done before the 11:00 admission run (5 hours after 06:00).
    expect(report.FinishedAfterHours.Triage).toBeLessThanOrEqual(5);
    expect(report.FinishedAfterHours.Extraction).toBeLessThanOrEqual(24);
    expect(report.Verdicts).toEqual({
      TriageBeforeAdmission: true,
      TriageBeforeNextIngestion: true,
      ExtractionWithin24Hours: true,
      NothingLost: true,
    });
    // The model queue never runs more than its concurrency of 8.
    const models = report.Queues.find((queue) => queue.Name === "roi-models-load");
    expect(models?.PeakConcurrency).toBe(8);
    expect(report.Models.every((model) => model.PeakBusy <= 8)).toBe(true);
  }, 120_000);

  it("REQ-NFR-010: AC2 without pacing, extraction runs into the model's request limit and misses the day", async () => {
    const report = await runLoad({ Publications: 300, ExtractionRequestsPerMinute: null });
    const extraction = report.Models.find((model) => model.Model.includes("deepseek"));
    expect(extraction?.RateLimited).toBeGreaterThan(0);
    expect(report.Counts.RedriveRows).toBeGreaterThan(0);
    expect(report.Verdicts.ExtractionWithin24Hours).toBe(false);
  }, 60_000);
});
