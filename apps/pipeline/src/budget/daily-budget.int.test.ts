import { describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../test/sqlite-d1.js";
import {
  formulaDailyLimit,
  measuredCostPerItem,
  stepCosts,
  type StepCosts,
} from "./daily-budget.js";

const ESTIMATED: StepCosts = {
  triage: { Amount: 0.0001, Source: "estimated" },
  extraction: { Amount: 0.004, Source: "estimated" },
  embedding: { Amount: 0.00003, Source: "estimated" },
};
const WINDOW = { Days: 7, MinItems: 20 };

let callNumber = 0;

/** A recorded call of `step` for `publicationId`, as `callModel` writes it. */
function call(
  test: TestDatabase,
  step: string,
  publicationId: string | null,
  cost: number,
  createdAt: string,
): void {
  callNumber += 1;
  test.Raw.prepare(
    `INSERT INTO model_call (id, run_kind, run_id, step_name, publication_id, model, attempt,
       cost_amount, cost_currency, outcome, created_at)
     VALUES (?, 'processing', 'prun_1', ?, ?, '@cf/example/model', 1, ?, 'EUR', 'ok', ?)`,
  ).run(`mc_${callNumber}`, step, publicationId, cost, createdAt);
}

describe("REQ-NFR-005: the measured cost replaces the estimate (ADR 0032)", () => {
  it("REQ-NFR-005: AC1 uses the estimate until enough items are measured", async () => {
    const test = createTestDatabase();
    for (let i = 0; i < 19; i += 1) {
      call(test, "triage", `pub_${i}`, 0.0002, "2026-11-20T08:00:00.000Z");
    }
    expect(await measuredCostPerItem(test.Db, "triage", "2026-11-23", WINDOW)).toBeNull();
    expect(await stepCosts(test.Db, "2026-11-23", ESTIMATED, WINDOW)).toEqual(ESTIMATED);
  });

  it("REQ-NFR-005: AC1 the measured cost per item counts retries and is per publication", async () => {
    const test = createTestDatabase();
    for (let i = 0; i < 20; i += 1) {
      call(test, "triage", `pub_${i}`, 0.0001, "2026-11-21T08:00:00.000Z");
    }
    // A retry of one publication adds to its cost, not to the items.
    call(test, "triage", "pub_0", 0.0002, "2026-11-21T08:00:01.000Z");
    // Calls of the day itself and of days outside the window are not counted.
    call(test, "triage", "pub_x", 9, "2026-11-23T01:00:00.000Z");
    call(test, "triage", "pub_y", 9, "2026-11-15T23:59:59.000Z");

    const costs = await stepCosts(test.Db, "2026-11-23", ESTIMATED, WINDOW);
    expect(costs.triage).toEqual({ Amount: 0.00011, Source: "measured" });
    expect(costs.extraction).toEqual(ESTIMATED.extraction);
  });

  it("REQ-NFR-005: AC1 an embedding call serves a batch, so its items are the embeddings written", async () => {
    const test = createTestDatabase();
    test.Raw.prepare(
      "INSERT INTO embedding_index (id, binding, vectorize_name, model_name, model_version, dimensions, metric, current) VALUES ('idx_1', 'PUBLICATION_VECTORS', 'roi-publications-test', '@cf/baai/bge-base-en-v1.5', 'v1.5', 768, 'cosine', 1)",
    ).run();
    for (let i = 0; i < 25; i += 1) {
      test.Raw.prepare(
        "INSERT INTO publication (id, title, completeness, created_at, updated_at) VALUES (?, 'Title', 'complete', '2026-11-20T00:00:00.000Z', '2026-11-20T00:00:00.000Z')",
      ).run(`pub_${i}`);
      test.Raw.prepare(
        "INSERT INTO embedding (id, publication_id, embedding_index_id, vectorize_id, model_name, model_version, input_kind, created_at) VALUES (?, ?, 'idx_1', ?, '@cf/baai/bge-base-en-v1.5', 'v1.5', 'title-abstract', '2026-11-21T09:00:00.000Z')",
      ).run(`emb_${i}`, `pub_${i}`, `pub_${i}`);
    }
    call(test, "embedding", null, 0.0005, "2026-11-21T09:00:00.000Z");

    expect(await measuredCostPerItem(test.Db, "embedding", "2026-11-23", WINDOW)).toBe(0.00002);
  });

  it("REQ-NFR-005: AC1 the day's limit is the formula over the measured and estimated costs", async () => {
    const test = createTestDatabase();
    for (let i = 0; i < 20; i += 1) {
      call(test, "triage", `pub_${i}`, 0.0002, "2026-11-22T08:00:00.000Z");
    }
    const logged: Array<Record<string, unknown>> = [];
    const limit = formulaDailyLimit({
      Db: test.Db,
      Inputs: {
        ExpectedDailyTriaged: 1000,
        DailyExtractionLimit: 100,
        ExpectedDailyEmbeddings: 1000,
        Multiplier: 1.5,
      },
      Estimated: ESTIMATED,
      Window: WINDOW,
      Log: (_event, fields) => logged.push(fields),
    });
    // (1000 x 0.0002 + 100 x 0.004 + 1000 x 0.00003) x 1.5 = 0.945
    expect(await limit("2026-11-23")).toEqual({ Amount: 0.945, Currency: "EUR" });
    expect(logged).toEqual([
      expect.objectContaining({
        day: "2026-11-23",
        triageCost: "measured",
        extractionCost: "estimated",
      }),
    ]);
  });
});
