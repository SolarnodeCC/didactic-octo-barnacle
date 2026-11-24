import { OpportunityDetailSchema } from "@roi/models";
import { describe, expect, it } from "vitest";

import { handleApiRequest } from "./handler.js";
import { createTestDatabase } from "./test/sqlite-d1.js";

const NOW = "2026-11-24T10:00:00.000Z";

const RESEARCH = {
  Novelty: 60,
  NoveltyRationale: "Links switching patterns to output over months.",
  RelatedPublicationIds: [],
  Maturity: "field-tested",
  Industry: ["public-sector"],
  Technology: ["activity sensing"],
  Confidence: 0.6,
  Notes: null,
};

/** A scored opportunity with one agent output and its evidence, as the pipeline stores it. */
function seed(status: "complete" | "incomplete" | "hidden" = "complete") {
  const test = createTestDatabase();
  const run = (sql: string, ...values: unknown[]) => test.Raw.prepare(sql).run(...values);
  run(
    `INSERT INTO publication (id, title, doi, published_at, abstract, completeness, created_at, updated_at)
     VALUES ('pub_1', 'Task switching and focus loss', '10.0000/example.0001', '2026-09-15', 'A secret abstract.', 'complete', ?, ?)`,
    NOW,
    NOW,
  );
  run(
    `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode, confidence, candidate_count, created_at)
     VALUES ('ext_1', 'pub_1', 'prun_1', 'm', 'extraction@4', 'abstract', 0.7, 1, ?)`,
    NOW,
  );
  run(
    `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote, customer, customer_quote, created_at)
     VALUES ('cand_1', 'pub_1', 'ext_1', 'Switching reduces focus.', 'Switching reduced focus.', 'knowledge workers', 'knowledge workers', ?)`,
    NOW,
  );
  run(
    `INSERT INTO pipeline_run (id, candidate_id, status, started_at) VALUES ('pr_cand_1', 'cand_1', 'complete', ?)`,
    NOW,
  );
  run(
    `INSERT INTO agent_output (id, pipeline_run_id, candidate_id, agent, envelope_json, output_json, created_at)
     VALUES ('ao_1', 'pr_cand_1', 'cand_1', 'ResearchAnalyst', ?, ?, ?)`,
    JSON.stringify({ Model: "stub", PromptVersion: "example", Output: RESEARCH }),
    JSON.stringify(RESEARCH),
    NOW,
  );
  run(
    `INSERT INTO evidence (id, agent_output_id, field, kind, quote, publication_id, url, note, retrieved_at)
     VALUES ('ev_1', 'ao_1', 'NoveltyRationale', 'publication-quote', 'Switching reduced focus.', 'pub_1', NULL, NULL, ?)`,
    NOW,
  );
  run(
    `INSERT INTO opportunity (id, candidate_id, pipeline_status, hidden_reason, current_score_id, created_at, updated_at)
     VALUES ('opp_1', 'cand_1', ?, ?, ?, ?, ?)`,
    status,
    status === "hidden" ? "retracted" : null,
    status === "incomplete" ? null : "sc_1",
    NOW,
    NOW,
  );
  if (status !== "incomplete") {
    run(
      `INSERT INTO score (id, opportunity_id, score_model_id, categories_json, explanation_json, weighted_sum, final_score, band, estimate_based, created_at)
       VALUES ('sc_1', 'opp_1', 'sm_placeholder_0', ?, '{}', 71.22, 71, 'High', 1, ?)`,
      JSON.stringify({
        ScientificNovelty: 60,
        MarketPotential: 76.1,
        CompetitiveGap: 50,
        TechnicalFeasibility: 80,
        StrategicRelevance: 90,
      }),
      NOW,
    );
  }
  return test;
}

const get = (db: ReturnType<typeof seed>["Db"], path: string, method = "GET") =>
  handleApiRequest(db, new Request(`http://localhost${path}`, { method }));

describe("REQ-PROC-007: the read route of the thin slice (ADR 0058)", () => {
  it("REQ-PROC-007: AC1 returns the opportunity with its publication, candidate, outputs, evidence, and score", async () => {
    const test = seed();
    const response = await get(test.Db, "/api/v1/opportunities/opp_1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = OpportunityDetailSchema.parse(await response.json());
    expect(body).toMatchObject({
      Id: "opp_1",
      PipelineStatus: "complete",
      Publication: { Id: "pub_1", Title: "Task switching and focus loss" },
      Candidate: { Id: "cand_1", Customer: "knowledge workers" },
      Score: {
        ModelVersion: "placeholder-0",
        OpportunityScore: 71,
        Band: "High",
        Labels: ["estimate-based"],
      },
    });
    expect(body.AgentOutputs).toHaveLength(1);
    expect(body.AgentOutputs[0]).toMatchObject({
      Step: "research_analyst",
      Model: "stub",
      Evidence: [{ Field: "NoveltyRationale", Kind: "publication-quote", PublicationId: "pub_1" }],
    });
    // The response carries the record, never the abstract.
    expect(JSON.stringify(body)).not.toContain("secret abstract");
  });

  it("REQ-PROC-007: AC1 an opportunity without a score is returned as incomplete", async () => {
    const body = OpportunityDetailSchema.parse(
      await (await get(seed("incomplete").Db, "/api/v1/opportunities/opp_1")).json(),
    );
    expect(body).toMatchObject({ PipelineStatus: "incomplete", Score: null });
  });

  it("REQ-DATA-008: AC2 a hidden opportunity is not returned", async () => {
    expect((await get(seed("hidden").Db, "/api/v1/opportunities/opp_1")).status).toBe(404);
  });

  it("REQ-PROC-007: AC1 an unknown ID or path is 404 and another method is 405", async () => {
    const { Db } = seed();
    expect((await get(Db, "/api/v1/opportunities/opp_missing")).status).toBe(404);
    expect((await get(Db, "/api/v1/opportunities/opp_1/scores")).status).toBe(404);
    expect((await get(Db, "/api/v1/opportunities/bad%20id")).status).toBe(404);
    expect((await get(Db, "/")).status).toBe(404);
    const post = await get(Db, "/api/v1/opportunities/opp_1", "POST");
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET");
  });

  it("REQ-PROC-007: AC1 stored rows that break the contract give a 500 that names no stored text", async () => {
    const test = seed();
    test.Raw.prepare("UPDATE agent_output SET envelope_json = ?").run(
      JSON.stringify({ Model: "stub", PromptVersion: "example", Output: { Novelty: "secret" } }),
    );
    const response = await get(test.Db, "/api/v1/opportunities/opp_1");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
