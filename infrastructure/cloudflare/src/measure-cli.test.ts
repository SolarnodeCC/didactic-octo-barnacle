import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { MEASURE_USAGE, parseMeasureArgs, runMeasureCli } from "./measure-cli.js";
import { MEASUREMENT_QUERIES } from "./measure/queries.js";

const assumptionsFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../measure/cost-assumptions.json",
);
const ASSUMPTIONS = readFileSync(assumptionsFile, "utf8");

function harness(execute: (sql: string) => Promise<Record<string, unknown>[]>) {
  const logs: string[] = [];
  const errors: string[] = [];
  const written = new Map<string, string>();
  const reads: string[] = [];
  const environments: string[] = [];
  const deps = {
    Execute: (environment: string) => {
      environments.push(environment);
      return execute;
    },
    ReadFile: (path: string) => {
      reads.push(path);
      return ASSUMPTIONS;
    },
    WriteFile: (path: string, text: string) => {
      written.set(path, text);
    },
    Now: () => "2026-11-06T09:00:00.000Z",
    Log: (line: string) => logs.push(line),
    Error: (line: string) => errors.push(line),
  };
  return { deps, logs, errors, written, reads, environments };
}

describe("REQ-NFR-005: measurement CLI", () => {
  it("REQ-NFR-005: parses the environment, the assumptions file, and the JSON output", () => {
    expect(parseMeasureArgs(["--env", "staging"])).toEqual({
      Environment: "staging",
      AssumptionsPath: "measure/cost-assumptions.json",
    });
    expect(
      parseMeasureArgs(["--env", "preview", "--assumptions", "a.json", "--json-out", "out.json"]),
    ).toEqual({ Environment: "preview", AssumptionsPath: "a.json", JsonOut: "out.json" });
  });

  it.each([[[]], [["--env", "local"]], [["--json-out"]], [["--env", "staging", "--apply"]]])(
    "REQ-NFR-005: refuses arguments that do not match the usage line: %j",
    async (args) => {
      const execute = vi.fn(() => Promise.resolve([]));
      const h = harness(execute);

      expect(await runMeasureCli(args, h.deps)).toBe(2);
      expect(h.errors).toEqual([MEASURE_USAGE]);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("REQ-NFR-005: runs every measurement query once and prints the report", async () => {
    const execute = vi.fn(() => Promise.resolve([]));
    const h = harness(execute);

    expect(await runMeasureCli(["--env", "staging"], h.deps)).toBe(0);
    expect(h.environments).toEqual(["staging"]);
    expect(h.reads).toEqual(["measure/cost-assumptions.json"]);
    expect(execute.mock.calls.map(([sql]) => sql)).toEqual(
      MEASUREMENT_QUERIES.map((query) => query.Sql),
    );
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatch(/^#/u);
    expect(h.written.size).toBe(0);
  });

  it("REQ-NFR-005: --json-out writes the same report as JSON", async () => {
    const h = harness(() => Promise.resolve([]));

    expect(await runMeasureCli(["--env", "staging", "--json-out", "phase1.json"], h.deps)).toBe(0);
    const report = JSON.parse(h.written.get("phase1.json") as string) as Record<string, unknown>;
    expect(report).toMatchObject({ GeneratedAt: "2026-11-06T09:00:00.000Z" });
  });

  it("REQ-NFR-005: a failing query exits 1 with its message and writes nothing", async () => {
    const h = harness(() =>
      Promise.reject(new Error("Measuring failed. Wrangler said:\nno such table")),
    );

    expect(await runMeasureCli(["--env", "staging", "--json-out", "phase1.json"], h.deps)).toBe(1);
    expect(h.errors).toEqual(["Measuring failed. Wrangler said:\nno such table"]);
    expect(h.logs).toEqual([]);
    expect(h.written.size).toBe(0);
  });
});
