import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fakeEmbedding } from "@roi/models";
import { describe, expect, it } from "vitest";

import { evaluateRecall, recallAt10, type RecallCorpus } from "./recall.js";
import { buildRecallCorpus, loadRecallCorpus, loadRecallThreshold } from "./recall-corpus.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CORPUS_DIR = join(here, "../fixtures/recall");

describe("REQ-PROC-003: the recall-at-10 corpus (ADR 0057)", () => {
  it("REQ-PROC-003 AC3: the committed corpus is the one built from the committed fixtures", () => {
    const built = buildRecallCorpus(
      join(ROOT, "agents/extraction/evals/fixtures/arxiv"),
      join(ROOT, "agents/analysis/evals/fixtures/neighbors"),
    );
    expect(loadRecallCorpus(CORPUS_DIR)).toEqual(built);
  });

  it("REQ-PROC-003 AC3: it holds at least 30 queries whose relevant publications are all in the corpus, and a threshold of 0.8", () => {
    const corpus = loadRecallCorpus(CORPUS_DIR);
    const ids = new Set(corpus.Publications.map((p) => p.Id));
    expect(corpus.Queries.length).toBeGreaterThanOrEqual(30);
    for (const query of corpus.Queries) {
      expect(ids.has(query.Id)).toBe(true);
      expect(query.Relevant.length).toBeGreaterThan(0);
      expect(query.Relevant.every((id) => ids.has(id))).toBe(true);
      expect(query.Relevant).not.toContain(query.Id);
    }
    expect(loadRecallThreshold(CORPUS_DIR)).toEqual({ metric: "recall-at-10", minimum: 0.8 });
  });
});

describe("REQ-PROC-003: the recall evaluator", () => {
  it("REQ-PROC-003 AC3: a known ranking gives a known recall, with the query's own publication left out", async () => {
    const corpus: RecallCorpus = {
      Publications: [],
      Queries: [
        { Id: "q1", Text: "", Relevant: ["a", "b"] },
        { Id: "q2", Text: "", Relevant: ["c", "d", "e", "f"] },
      ],
    };
    const rankings: Record<string, string[]> = {
      // q1 finds both, after itself: 2 / 2.
      q1: ["q1", "a", "x", "b"],
      // q2 finds one of four in its top 10; "d" is ranked eleventh: 1 / 4.
      q2: ["c", "1", "2", "3", "4", "5", "6", "7", "8", "9", "d"],
    };
    const report = await recallAt10(corpus, (query) => Promise.resolve(rankings[query.Id] ?? []));
    expect(report.Queries.map((q) => q.Recall)).toEqual([1, 0.25]);
    expect(report.Recall).toBe(0.625);
  });

  it("REQ-PROC-003 AC3: with deterministic fake vectors, a publication sharing the query's words is found first", async () => {
    const corpus: RecallCorpus = {
      Publications: [
        { Id: "grid", Title: "Grid operators", Abstract: "transformer faults in power grids" },
        {
          Id: "grid2",
          Title: "Power grid faults",
          Abstract: "operators predict transformer faults",
        },
        { Id: "bank", Title: "Banks", Abstract: "reconcile payments by hand" },
      ],
      Queries: [
        {
          Id: "grid",
          Text: "Grid operators\n\ntransformer faults in power grids",
          Relevant: ["grid2"],
        },
      ],
    };
    const report = await evaluateRecall(corpus, (texts) =>
      Promise.resolve(texts.map((text) => fakeEmbedding(text))),
    );
    expect(report.Recall).toBe(1);
  });
});
