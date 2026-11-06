import { describe, expect, it } from "vitest";

import { reportForAlert } from "./safe-report.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { type PipelineDeps } from "../queue/deps.js";
import { createHarness, makeWork, openAlexPage } from "../test/harness.js";

describe("REQ-NFR-008: run report attached to an alert", () => {
  it("REQ-NFR-008: returns the run report when it can be built", async () => {
    const h = createHarness();
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, "0 6 * * *");
    await h.Drain();
    const runId = h.Run()["id"] as string;

    const report = await reportForAlert(h.Deps, runId, h.Clock.Now);

    expect(report).toMatchObject({ RunId: runId, Status: "succeeded" });
  });

  it("REQ-NFR-008: a report that cannot be built returns null and logs the reason, so the alert still goes out", async () => {
    const logged: Array<{ event: string; fields: Record<string, unknown> }> = [];
    const deps = {
      Db: {
        prepare: () => {
          throw new Error("D1 is unavailable");
        },
        batch: () => Promise.resolve([]),
      },
      Log: (event: string, fields: Record<string, unknown>) => logged.push({ event, fields }),
    } as unknown as PipelineDeps;

    const report = await reportForAlert(deps, "run_1", "2026-10-30T06:00:00.000Z");

    expect(report).toBeNull();
    expect(logged).toEqual([
      { event: "report.failed", fields: { runId: "run_1", error: "D1 is unavailable" } },
    ]);
  });
});
