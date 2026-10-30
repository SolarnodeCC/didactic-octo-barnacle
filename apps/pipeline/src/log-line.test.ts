import { describe, expect, it } from "vitest";

import { logLine } from "./log-line.js";

const now = () => "2026-10-30T06:00:00.000Z";

describe("REQ-NFR-008: structured logs", () => {
  it("REQ-NFR-008: a log line is JSON with a timestamp, level, event, environment, and run ID", () => {
    const line = JSON.parse(logLine("staging", "page.processed", { runId: "run_1", page: 2 }, now));
    expect(line).toEqual({
      runId: "run_1",
      page: 2,
      ts: "2026-10-30T06:00:00.000Z",
      level: "info",
      event: "page.processed",
      env: "staging",
    });
  });

  it("REQ-NFR-008: a log line can carry the publication ID", () => {
    const line = JSON.parse(logLine("staging", "document.stored", { publicationId: "pub_1" }, now));
    expect(line.publicationId).toBe("pub_1");
  });

  it("REQ-NFR-008: failures are errors and refusals are warnings", () => {
    const level = (event: string) => JSON.parse(logLine("staging", event, {}, now)).level;
    expect(level("page.failed")).toBe("error");
    expect(level("dead_letter.recorded")).toBe("error");
    expect(level("alert.delivery_failed")).toBe("error");
    expect(level("document.refused")).toBe("warn");
    expect(level("message.skipped")).toBe("warn");
    expect(level("run.started")).toBe("info");
  });

  it("REQ-NFR-008: a field cannot replace the canonical keys", () => {
    const line = JSON.parse(
      logLine(
        "staging",
        "run.started",
        { event: "forged", level: "debug", env: "production", ts: "x" },
        now,
      ),
    );
    expect(line).toMatchObject({ event: "run.started", level: "info", env: "staging", ts: now() });
  });
});
