import { OpportunityScoreSchema } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleCandidateRun } from "./run-consumer.js";
import { stubStep, type AgentStep } from "./steps.js";
import { candidateRunEnvelope } from "../queue/deps.js";
import { createHarness, type Harness } from "../test/harness.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = "2026-11-23T10:00:00.000Z";
const CANDIDATE = "cand_1";
const PUBLICATION = "pub_1";

/** One publication with one extracted candidate, as extraction stores them. */
function seedCandidate(h: Harness): void {
  const sql = (statement: string, ...values: unknown[]) =>
    h.Database.Raw.prepare(statement).run(...values);
  sql(
    `INSERT INTO publication (id, title, abstract, completeness, created_at, updated_at)
     VALUES (?, 'Task switching and focus loss', 'Frequent switching between tasks reduced sustained focus.', 'complete', ?, ?)`,
    PUBLICATION,
    NOW,
    NOW,
  );
  sql(
    `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
       confidence, candidate_count, created_at)
     VALUES ('ext_1', ?, 'prun_1', 'm', 'extraction@4', 'abstract', 0.7, 1, ?)`,
    PUBLICATION,
    NOW,
  );
  sql(
    `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
       customer, customer_quote, created_at)
     VALUES (?, ?, 'ext_1', 'Task switching reduces focus.',
       'Frequent switching between tasks reduced sustained focus.', 'knowledge workers',
       'knowledge workers', ?)`,
    CANDIDATE,
    PUBLICATION,
    NOW,
  );
}

function setup(steps: Partial<Record<string, AgentStep>> = {}): Harness {
  const h = createHarness({}, { Candidate: { Steps: steps } });
  h.Clock.Now = NOW;
  seedCandidate(h);
  return h;
}

const rows = (h: Harness, sql: string, ...values: unknown[]) =>
  h.Database.Raw.prepare(sql).all(...values) as Array<Record<string, unknown>>;

describe("REQ-PROC-007: the candidate pipeline with stub steps", () => {
  it("REQ-PROC-007: AC1 runs every step in order, stores each output with its evidence, and scores the opportunity", async () => {
    const h = setup();
    expect(await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE, "slice_1"))).toBe(
      "started",
    );

    const [workflow] = h.Workflows;
    expect(workflow?.Id).toBe(`pr_${CANDIDATE}`);
    expect(workflow?.Error).toBeUndefined();
    // Research Analyst and Problem Discovery first, the three in parallel, then the rest.
    expect(workflow?.Steps.slice(0, 2)).toEqual(["research_analyst", "problem_discovery"]);
    expect([...(workflow?.Steps.slice(2, 5) ?? [])].sort()).toEqual([
      "competition",
      "market_analysis",
      "relevance",
    ]);
    expect(workflow?.Steps.slice(5)).toEqual(["startup_generator", "scoring"]);

    expect(
      rows(h, "SELECT step_name, status FROM pipeline_step ORDER BY step_name").map(
        (row) => `${String(row.step_name)}:${String(row.status)}`,
      ),
    ).toEqual([
      "competition:complete",
      "market_analysis:complete",
      "problem_discovery:complete",
      "relevance:complete",
      "research_analyst:complete",
      "scoring:complete",
      "startup_generator:complete",
    ]);
    const outputs = rows(h, "SELECT id, agent, envelope_json FROM agent_output ORDER BY agent");
    expect(outputs.map((row) => row.agent)).toEqual([
      "Competition",
      "MarketAnalysis",
      "ProblemDiscovery",
      "Relevance",
      "ResearchAnalyst",
      "StartupGenerator",
    ]);
    const envelope = JSON.parse(String(outputs[4]?.envelope_json)) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      Agent: "ResearchAnalyst",
      RunId: `pr_${CANDIDATE}`,
      PublicationId: PUBLICATION,
      CandidateId: CANDIDATE,
      Model: "stub",
      PromptVersion: "example",
      InputMode: "abstract",
    });
    // The example's publication quote names the run's publication.
    expect(
      rows(
        h,
        "SELECT kind, publication_id FROM evidence WHERE kind = 'publication-quote' ORDER BY id",
      ).every((row) => row.publication_id === PUBLICATION),
    ).toBe(true);
    expect(h.Count("evidence")).toBe(6);

    const [opportunity] = rows(
      h,
      "SELECT pipeline_status, current_score_id FROM opportunity WHERE candidate_id = ?",
      CANDIDATE,
    );
    expect(opportunity?.pipeline_status).toBe("complete");
    const [score] = rows(
      h,
      `SELECT s.id, s.final_score, s.band, s.weighted_sum, s.estimate_based, m.version
       FROM score s JOIN score_model m ON m.id = s.score_model_id`,
    );
    expect(score).toMatchObject({
      id: opportunity?.current_score_id,
      final_score: 71,
      band: "High",
      weighted_sum: 71.22,
      estimate_based: 1,
      version: "placeholder-0",
    });
    expect(rows(h, "SELECT status, processing_run_id FROM pipeline_run")).toEqual([
      { status: "complete", processing_run_id: "slice_1" },
    ]);
    expect(
      OpportunityScoreSchema.parse({
        ModelVersion: "placeholder-0",
        Categories: JSON.parse(
          String(rows(h, "SELECT categories_json FROM score")[0]?.categories_json),
        ) as unknown,
        WeightedSum: 71.22,
        OpportunityScore: 71,
        Band: "High",
        Labels: ["estimate-based"],
      }),
    ).toBeTruthy();
  });

  it("REQ-PROC-007: AC1 a repeated run repeats no step and adds no output", async () => {
    const h = setup();
    await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE));
    // The same Workflow instance replayed, as after a restart of the Workflow.
    await h.Deps.Candidate?.Workflow.create({
      id: `pr_${CANDIDATE}`,
      params: { PipelineRunId: `pr_${CANDIDATE}` },
    });
    expect(h.Count("agent_output")).toBe(6);
    expect(h.Count("score")).toBe(1);
    // A second message for a scored candidate starts nothing.
    expect(
      await handleCandidateRun(h.Deps, {
        ...candidateRunEnvelope(CANDIDATE),
        MessageId: "candidate:again",
      }),
    ).toBe("already-scored");
    expect(h.Workflows).toHaveLength(2);
  });

  it("REQ-PROC-007: AC4 a replaced step changes its output and nothing else in the pipeline", async () => {
    const stub = stubStep("relevance");
    const replaced: AgentStep = {
      ...stub,
      async run(input) {
        const result = await stub.run(input);
        const output = result.Output as { TechnicalFeasibility: number };
        return {
          ...result,
          Model: "@cf/example/relevance-model",
          PromptVersion: "relevance@5",
          Output: { ...output, TechnicalFeasibility: 30 },
        };
      },
    };
    const h = setup({ relevance: replaced });
    await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE));

    expect(h.Workflows[0]?.Error).toBeUndefined();
    expect(h.Count("agent_output")).toBe(6);
    const [relevance] = rows(h, "SELECT envelope_json FROM agent_output WHERE agent = 'Relevance'");
    expect(JSON.parse(String(relevance?.envelope_json))).toMatchObject({
      Model: "@cf/example/relevance-model",
      PromptVersion: "relevance@5",
    });
    // (60 + 76.1 + 50 + 30 + 90) / 5 = 61.22, so the score follows the replaced output.
    expect(rows(h, "SELECT final_score, band FROM score")).toEqual([
      { final_score: 61, band: "Medium" },
    ]);
  });

  it("REQ-PROC-007: AC1 a failed step is recorded and leaves the opportunity incomplete and unscored", async () => {
    const failing: AgentStep = {
      ...stubStep("competition"),
      run: () => Promise.reject(new Error("the competition agent is not available")),
    };
    const h = setup({ competition: failing });
    expect(await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE))).toBe("started");

    expect(h.Workflows[0]?.Error).toBeInstanceOf(Error);
    expect(
      rows(h, "SELECT status, error_json FROM pipeline_step WHERE step_name = 'competition'"),
    ).toEqual([
      {
        status: "failed",
        error_json: JSON.stringify({ Error: "the competition agent is not available" }),
      },
    ]);
    expect(rows(h, "SELECT pipeline_status, current_score_id FROM opportunity")).toEqual([
      { pipeline_status: "incomplete", current_score_id: null },
    ]);
    expect(h.Count("score")).toBe(0);
  });

  it("REQ-PROC-007: AC1 an output that breaks its contract is not stored", async () => {
    const broken: AgentStep = {
      ...stubStep("market_analysis"),
      run: async (input) => ({
        ...(await stubStep("market_analysis").run(input)),
        Output: { TAM: "large" },
      }),
    };
    const h = setup({ market_analysis: broken });
    await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE));
    expect(rows(h, "SELECT agent FROM agent_output WHERE agent = 'MarketAnalysis'")).toEqual([]);
    expect(rows(h, "SELECT status FROM pipeline_step WHERE step_name = 'market_analysis'")).toEqual(
      [{ status: "failed" }],
    );
  });

  it("REQ-DATA-008: AC2 a candidate of a retracted publication is not run", async () => {
    const h = setup();
    h.Database.Raw.prepare("UPDATE publication SET retracted = 1").run();
    expect(await handleCandidateRun(h.Deps, candidateRunEnvelope(CANDIDATE))).toBe("hidden");
    expect(h.Workflows).toEqual([]);
    expect(h.Count("opportunity")).toBe(0);
  });
});
