/**
 * The slice of a Vectorize index binding the pipeline uses (REQ-PROC-002). The real binding
 * satisfies it structurally; tests use `FakeVectorize`.
 */

/** Metadata stored with every publication vector; both fields have a metadata index (ADR 0056). */
export type PublicationVectorMetadata = {
  source: string;
  /** Publication date as `YYYYMMDD`, so date ranges filter as numbers. */
  published_day: number;
};

export type VectorRecord = {
  /** The publication ID: a repeated write overwrites, and a deletion needs no lookup. */
  id: string;
  values: number[];
  metadata: PublicationVectorMetadata;
};

type Comparison = { $eq?: string | number; $gte?: number; $lte?: number };

/** The metadata filter of a query: `$eq`, `$gte`, and `$lte` on indexed fields. */
export type VectorFilter = Partial<Record<keyof PublicationVectorMetadata, Comparison>>;

export type VectorMatch = { id: string; score: number };

export interface VectorIndex {
  upsert(vectors: VectorRecord[]): Promise<unknown>;
  query(
    vector: number[],
    options: { topK: number; filter?: VectorFilter; returnMetadata?: "none" },
  ): Promise<{ matches: VectorMatch[]; count?: number }>;
  deleteByIds(ids: string[]): Promise<unknown>;
}

/** Vectorize returns at most 100 matches without values or metadata (Vectorize limits). */
export const MAX_TOP_K = 100;

/** Vectorize accepts at most 1,000 vectors in one upsert from a Worker. */
export const MAX_UPSERT_BATCH = 1000;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function matches(metadata: PublicationVectorMetadata, filter: VectorFilter | undefined): boolean {
  for (const [field, comparison] of Object.entries(filter ?? {})) {
    const value = metadata[field as keyof PublicationVectorMetadata];
    if (comparison.$eq !== undefined && value !== comparison.$eq) {
      return false;
    }
    if (comparison.$gte !== undefined && !(typeof value === "number" && value >= comparison.$gte)) {
      return false;
    }
    if (comparison.$lte !== undefined && !(typeof value === "number" && value <= comparison.$lte)) {
      return false;
    }
  }
  return true;
}

/** An in-memory Vectorize index with exact cosine ranking, for tests and the recall check. */
export class FakeVectorize implements VectorIndex {
  readonly Vectors = new Map<string, VectorRecord>();
  readonly Queries: Array<{ topK: number; filter?: VectorFilter }> = [];

  upsert(vectors: VectorRecord[]): Promise<unknown> {
    if (vectors.length > MAX_UPSERT_BATCH) {
      return Promise.reject(new Error(`at most ${MAX_UPSERT_BATCH} vectors per upsert`));
    }
    for (const vector of vectors) {
      this.Vectors.set(vector.id, { ...vector, values: [...vector.values] });
    }
    return Promise.resolve({ mutationId: `m_${this.Vectors.size}` });
  }

  query(
    vector: number[],
    options: { topK: number; filter?: VectorFilter },
  ): Promise<{ matches: VectorMatch[]; count: number }> {
    if (options.topK > MAX_TOP_K) {
      return Promise.reject(new Error(`topK is at most ${MAX_TOP_K}`));
    }
    this.Queries.push({
      topK: options.topK,
      ...(options.filter ? { filter: options.filter } : {}),
    });
    const ranked = [...this.Vectors.values()]
      .filter((record) => matches(record.metadata, options.filter))
      .map((record) => ({ id: record.id, score: cosine(vector, record.values) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, options.topK);
    return Promise.resolve({ matches: ranked, count: ranked.length });
  }

  deleteByIds(ids: string[]): Promise<unknown> {
    for (const id of ids) {
      this.Vectors.delete(id);
    }
    return Promise.resolve({ mutationId: `d_${ids.length}` });
  }
}
