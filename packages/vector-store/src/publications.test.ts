import {
  FakeWorkersAi,
  ModelCallRecordSchema,
  fakeEmbedding,
  type CallModelDeps,
  type FakeReply,
  type ModelCallRecord,
} from "@roi/models";
import { describe, expect, it } from "vitest";

import {
  REFERENCE_EMBEDDING,
  deletePublicationVectors,
  embeddingInput,
  publishedDay,
  searchPublications,
  upsertPublicationVectors,
  type IndexEntry,
} from "./publications.js";
import { FakeVectorize, MAX_TOP_K, type VectorRecord } from "./vector-index.js";

const ENTRY: IndexEntry = {
  Id: "idx_bge_base_768",
  Binding: "PUBLICATION_VECTORS",
  VectorizeName: "roi-publications-local",
  ModelName: REFERENCE_EMBEDDING.Model,
  ModelVersion: REFERENCE_EMBEDDING.Version,
  Dimensions: 768,
  Metric: "cosine",
  Current: true,
};

function callDeps(replies: FakeReply[], allowed = true) {
  const ai = new FakeWorkersAi(replies);
  const records: ModelCallRecord[] = [];
  let id = 0;
  const deps: CallModelDeps = {
    Ai: ai,
    GatewayId: "roi-local",
    Usage: {
      budgetAllows: () => Promise.resolve(allowed),
      record: (record) => {
        records.push(ModelCallRecordSchema.parse(record));
        return Promise.resolve();
      },
    },
    Prices: {
      Version: "2026-11-11",
      Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      UsdPerEur: 1.1165,
      ExchangeRateDate: "2026-11-11",
      Models: {
        [REFERENCE_EMBEDDING.Model]: {
          InputUsdPerMillionTokens: 0.0666,
          OutputUsdPerMillionTokens: 0,
        },
      },
    },
    MaxAttempts: 3,
    NewId: () => `mc_${(id += 1)}`,
    Now: () => new Date("2026-11-23T12:00:00Z"),
    Sleep: () => Promise.resolve(),
  };
  return { ai, records, deps };
}

function record(id: string, text: string, source: string, day: string): VectorRecord {
  return {
    id,
    values: fakeEmbedding(text),
    metadata: { source, published_day: publishedDay(day) },
  };
}

const CORPUS = [
  record("pub_grid", "grid operators lose transformers to faults", "openalex", "2026-11-01"),
  record("pub_grid_arxiv", "grid operators predict transformer faults", "arxiv", "2026-11-10"),
  record("pub_bank", "banks reconcile payments by hand", "openalex", "2026-10-01"),
];

describe("REQ-PROC-002: publication vectors", () => {
  it("REQ-PROC-002 AC1: a vector is linked to its publication ID with source and date metadata, and a rewrite overwrites it", async () => {
    const index = new FakeVectorize();
    await upsertPublicationVectors(index, CORPUS);
    await upsertPublicationVectors(index, [
      { ...CORPUS[0]!, metadata: { source: "openalex", published_day: 20261102 } },
    ]);
    expect(index.Vectors.size).toBe(3);
    expect(index.Vectors.get("pub_grid")?.metadata).toEqual({
      source: "openalex",
      published_day: 20261102,
    });
  });

  it("REQ-PROC-002 AC1: stored vectors are read back by publication ID, unknown IDs left out", async () => {
    const index = new FakeVectorize();
    await upsertPublicationVectors(index, CORPUS);
    const [found, ...rest] = await index.getByIds([CORPUS[0]!.id, "pub_unknown"]);
    expect(rest).toEqual([]);
    expect(found).toEqual({ id: CORPUS[0]!.id, values: CORPUS[0]!.values });
  });

  it("REQ-PROC-002 AC2: deleting removes the vector from every index", async () => {
    const current = new FakeVectorize();
    const next = new FakeVectorize();
    await upsertPublicationVectors(current, CORPUS);
    await upsertPublicationVectors(next, CORPUS);
    await deletePublicationVectors([current, next], ["pub_grid"]);
    expect([...current.Vectors.keys()]).not.toContain("pub_grid");
    expect([...next.Vectors.keys()]).not.toContain("pub_grid");
    expect(current.Vectors.size).toBe(2);
  });

  it("REQ-PROC-001 AC1: the input is the title, a blank line, and the abstract, or the title alone", () => {
    expect(embeddingInput(" A title ", " An abstract. ")).toEqual({
      Text: "A title\n\nAn abstract.",
      Kind: "title-abstract",
    });
    expect(embeddingInput("A title", null)).toEqual({ Text: "A title", Kind: "title-only" });
    expect(publishedDay("2026-11-23")).toBe(20261123);
    expect(publishedDay(null)).toBe(0);
  });
});

describe("REQ-PROC-003: semantic search", () => {
  async function search(query: string, options: Parameters<typeof searchPublications>[2]) {
    const index = new FakeVectorize();
    await upsertPublicationVectors(index, CORPUS);
    const call = callDeps([{ Kind: "embedding" }]);
    const result = await searchPublications(
      { Call: call.deps, Current: { Entry: ENTRY, Index: index }, RunId: "run_search" },
      query,
      options,
    );
    return { result, index, call };
  }

  it("REQ-PROC-003 AC1: a query returns publications ranked by similarity, with scores", async () => {
    const { result, call } = await search("grid operators transformer faults", { topK: 3 });
    expect(result.Ok).toBe(true);
    const hits = result.Ok ? result.Hits : [];
    expect(hits.map((hit) => hit.PublicationId)).toEqual([
      "pub_grid_arxiv",
      "pub_grid",
      "pub_bank",
    ]);
    expect(hits[0]!.Score).toBeGreaterThan(hits[2]!.Score);
    // REQ-PROC-001 AC3: the query is embedded with the current index's model through the gateway.
    expect(call.ai.Calls[0]).toMatchObject({ Model: REFERENCE_EMBEDDING.Model });
    expect(call.records[0]).toMatchObject({ StepName: "search", RunKind: "pipeline" });
  });

  it("REQ-PROC-003 AC2: results are filtered by source and publication date", async () => {
    const bySource = await search("grid operators", { source: "openalex", topK: 5 });
    expect(bySource.result.Ok && bySource.result.Hits.map((hit) => hit.PublicationId)).toEqual([
      "pub_grid",
      "pub_bank",
    ]);
    const byDate = await search("grid operators", {
      from: "2026-11-01",
      to: "2026-11-05",
      topK: 5,
    });
    expect(byDate.result.Ok && byDate.result.Hits.map((hit) => hit.PublicationId)).toEqual([
      "pub_grid",
    ]);
    expect(byDate.index.Queries[0]?.filter).toEqual({
      published_day: { $gte: 20261101, $lte: 20261105 },
    });
  });

  it("REQ-PROC-003: topK is kept within the Vectorize limit", async () => {
    const { index } = await search("grid", { topK: 500 });
    expect(index.Queries[0]?.topK).toBe(MAX_TOP_K);
  });

  it("REQ-NFR-005: with the budget used up search makes no call", async () => {
    const index = new FakeVectorize();
    const call = callDeps([{ Kind: "embedding" }], false);
    const result = await searchPublications(
      { Call: call.deps, Current: { Entry: ENTRY, Index: index }, RunId: "run_search" },
      "grid",
      { topK: 5 },
    );
    expect(result).toEqual({ Ok: false, Reason: "budget-exhausted" });
    expect(call.ai.Calls).toHaveLength(0);
  });
});
