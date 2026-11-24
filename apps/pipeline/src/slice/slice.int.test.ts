import { OpportunityDetailSchema } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runSlice } from "./run-slice.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("REQ-PROC-007: the thin slice end to end, in one process (ADR 0117)", () => {
  it("REQ-PROC-007: AC1 AC3 ingests, triages, extracts, runs the stub agents, scores, and serves the opportunity", async () => {
    const slice = await runSlice();
    const raw = slice.Database.Raw;
    const one = (sql: string) => raw.prepare(sql).get() as Record<string, unknown>;

    expect(one("SELECT COUNT(*) AS n FROM publication")).toEqual({ n: 1 });
    expect(one("SELECT accepted, reason FROM triage_decision")).toMatchObject({ accepted: 1 });
    expect(one("SELECT input_mode, candidate_count FROM extraction_result")).toEqual({
      input_mode: "abstract",
      candidate_count: 1,
    });
    expect(one("SELECT COUNT(*) AS n FROM agent_output")).toEqual({ n: 6 });

    expect(slice.Response.Status).toBe(200);
    const detail = OpportunityDetailSchema.parse(slice.Response.Body);
    expect(detail).toMatchObject({
      Id: slice.OpportunityId,
      PipelineStatus: "complete",
      Publication: { Id: slice.PublicationId },
      Candidate: { Customer: "knowledge workers in public agencies" },
      Score: {
        ModelVersion: "placeholder-0",
        OpportunityScore: 71,
        Band: "High",
        Labels: ["estimate-based"],
      },
    });
    // AC3: the stub outputs are the example's sections, in the order of the steps.
    expect(detail.AgentOutputs.map((output) => output.Agent)).toEqual([
      "ResearchAnalyst",
      "ProblemDiscovery",
      "MarketAnalysis",
      "Competition",
      "Relevance",
      "StartupGenerator",
    ]);
    expect(detail.AgentOutputs.flatMap((output) => output.Evidence)).toHaveLength(6);
  });

  it("REQ-PROC-007: AC2 writes the slice run report with its counts", async () => {
    const slice = await runSlice();
    expect(slice.Report).toMatchObject({
      RunId: slice.RunId,
      Kind: "slice",
      Status: "succeeded",
      Counts: {
        Ingested: 1,
        Triaged: 1,
        Extracted: 1,
        Candidates: 1,
        Opportunities: 1,
        Scored: 1,
      },
      Failures: [],
    });
  });
});
