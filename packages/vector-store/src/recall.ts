import { FakeVectorize } from "./vector-index.js";

/**
 * The recall-at-10 corpus of ADR 0057 (REQ-PROC-003 AC3): publications from the committed arXiv
 * fixtures, and queries with their labelled relevant publications.
 */
export type RecallCorpus = {
  Publications: Array<{ Id: string; Title: string; Abstract: string }>;
  /** A query is a publication's title and abstract; its relevant set is that publication's neighbours. */
  Queries: Array<{ Id: string; Text: string; Relevant: string[] }>;
};

export type RecallReport = {
  /** Mean over the queries of the share of relevant publications found in the top 10. */
  Recall: number;
  Queries: Array<{ Id: string; Found: number; Relevant: number; Recall: number }>;
};

/** Results counted per query. */
export const RECALL_K = 10;

/**
 * Recall at 10: for each query, the relevant publications among its first ten results, divided
 * by the number of relevant publications (at most ten), averaged over the queries. `rank`
 * returns publication IDs best first; the query's own publication is left out of its results.
 */
export async function recallAt10(
  corpus: RecallCorpus,
  rank: (query: RecallCorpus["Queries"][number]) => Promise<string[]>,
): Promise<RecallReport> {
  const perQuery: RecallReport["Queries"] = [];
  for (const query of corpus.Queries) {
    const top = (await rank(query)).filter((id) => id !== query.Id).slice(0, RECALL_K);
    const relevant = new Set(query.Relevant);
    const found = top.filter((id) => relevant.has(id)).length;
    const denominator = Math.min(relevant.size, RECALL_K);
    perQuery.push({
      Id: query.Id,
      Found: found,
      Relevant: relevant.size,
      Recall: denominator === 0 ? 1 : found / denominator,
    });
  }
  return {
    Recall:
      perQuery.length === 0 ? 0 : perQuery.reduce((sum, q) => sum + q.Recall, 0) / perQuery.length,
    Queries: perQuery,
  };
}

/** The text a corpus publication is embedded from: the same input as the pipeline's. */
function documentText(publication: RecallCorpus["Publications"][number]): string {
  return `${publication.Title.trim()}\n\n${publication.Abstract.trim()}`;
}

/**
 * Recall at 10 of an embedding function on the corpus: every publication and query is embedded
 * with `embed`, the publications go into an exact-cosine index, and each query is ranked
 * against it. With `fakeEmbedding` it checks the mechanics in CI; with a live model it is the
 * recall report of ADR 0057.
 */
export async function evaluateRecall(
  corpus: RecallCorpus,
  embed: (texts: string[]) => Promise<number[][]>,
  batchSize = 50,
): Promise<RecallReport> {
  const index = new FakeVectorize();
  for (let start = 0; start < corpus.Publications.length; start += batchSize) {
    const slice = corpus.Publications.slice(start, start + batchSize);
    const vectors = await embed(slice.map(documentText));
    await index.upsert(
      slice.map((publication, i) => ({
        id: publication.Id,
        values: vectors[i] ?? [],
        metadata: { source: "arxiv", published_day: 0 },
      })),
    );
  }
  const queryVectors = new Map<string, number[]>();
  for (let start = 0; start < corpus.Queries.length; start += batchSize) {
    const slice = corpus.Queries.slice(start, start + batchSize);
    const vectors = await embed(slice.map((query) => query.Text));
    slice.forEach((query, i) => queryVectors.set(query.Id, vectors[i] ?? []));
  }
  return recallAt10(corpus, async (query) => {
    const result = await index.query(queryVectors.get(query.Id) ?? [], { topK: RECALL_K + 1 });
    return result.matches.map((match) => match.id);
  });
}
