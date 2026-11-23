import { callEmbedding, type CallModelDeps } from "@roi/models";

import {
  MAX_TOP_K,
  MAX_UPSERT_BATCH,
  type VectorFilter,
  type VectorIndex,
  type VectorRecord,
} from "./vector-index.js";

/**
 * One index of the registry (`embedding_index`, ADR 0056): its binding, model, and whether
 * search reads it. The pipeline reads the rows; this package only uses them.
 */
export type IndexEntry = {
  Id: string;
  Binding: string;
  VectorizeName: string;
  ModelName: string;
  ModelVersion: string;
  Dimensions: number;
  Metric: "cosine" | "euclidean" | "dot-product";
  Current: boolean;
};

/** The reference model of ADR 0010 until the OQ-005 benchmark chooses one. */
export const REFERENCE_EMBEDDING = {
  Model: "@cf/baai/bge-base-en-v1.5",
  Version: "v1.5",
  Dimensions: 768,
  Metric: "cosine",
} as const;

export type EmbeddingInput = {
  Text: string;
  /** `title-only` when the publication has no abstract (REQ-PROC-001 AC1). */
  Kind: "title-abstract" | "title-only";
};

/** The text a publication is embedded from: the title, a blank line, and the abstract. */
export function embeddingInput(title: string, abstract: string | null): EmbeddingInput {
  const body = abstract?.trim() ?? "";
  return body === ""
    ? { Text: title.trim(), Kind: "title-only" }
    : { Text: `${title.trim()}\n\n${body}`, Kind: "title-abstract" };
}

/** `2026-11-23` becomes 20261123; a missing date becomes 0, before every real day. */
export function publishedDay(date: string | null): number {
  const digits = (date ?? "").slice(0, 10).replaceAll("-", "");
  return /^\d{8}$/u.test(digits) ? Number(digits) : 0;
}

/** Writes publication vectors, overwriting by publication ID (REQ-PROC-002 AC1). */
export async function upsertPublicationVectors(
  index: VectorIndex,
  items: readonly VectorRecord[],
): Promise<void> {
  for (let start = 0; start < items.length; start += MAX_UPSERT_BATCH) {
    await index.upsert(items.slice(start, start + MAX_UPSERT_BATCH));
  }
}

/**
 * Deletes the vectors of these publications from every index of the registry, so a retraction
 * during a backfill removes both (REQ-PROC-002 AC2, REQ-DATA-008 AC3, ADR 0056).
 */
export async function deletePublicationVectors(
  indexes: readonly VectorIndex[],
  publicationIds: readonly string[],
): Promise<void> {
  if (publicationIds.length === 0) {
    return;
  }
  for (const index of indexes) {
    for (let start = 0; start < publicationIds.length; start += MAX_UPSERT_BATCH) {
      await index.deleteByIds(publicationIds.slice(start, start + MAX_UPSERT_BATCH));
    }
  }
}

export type SearchOptions = {
  source?: string;
  /** First publication day, `YYYY-MM-DD`. */
  from?: string;
  /** Last publication day, `YYYY-MM-DD`. */
  to?: string;
  topK: number;
};

export type SearchHit = { PublicationId: string; Score: number };

export type SearchDeps = {
  Call: CallModelDeps;
  /** The current index of the registry and its binding. */
  Current: { Entry: IndexEntry; Index: VectorIndex };
  RunId: string;
};

export type SearchResult =
  | { Ok: true; Hits: SearchHit[] }
  | { Ok: false; Reason: "budget-exhausted" | "invalid-output" | "provider-error" };

/**
 * Semantic search (REQ-PROC-003 AC1, AC2): embeds the query with the current index's model
 * through AI Gateway, queries that index with the source and date filters, and returns
 * publication IDs with their similarity, best first. Search reads only the current index, so a
 * backfill of a new index changes nothing until the cut-over (REQ-PROC-001 AC2).
 */
export async function searchPublications(
  deps: SearchDeps,
  query: string,
  options: SearchOptions,
): Promise<SearchResult> {
  const topK = Math.max(1, Math.min(MAX_TOP_K, Math.floor(options.topK)));
  const embedded = await callEmbedding(deps.Call, {
    RunKind: "pipeline",
    RunId: deps.RunId,
    StepName: "search",
    Model: deps.Current.Entry.ModelName,
    Texts: [query],
  });
  if (!embedded.Ok) {
    return { Ok: false, Reason: embedded.Reason };
  }
  const filter: VectorFilter = {};
  if (options.source) {
    filter.source = { $eq: options.source };
  }
  if (options.from || options.to) {
    filter.published_day = {
      ...(options.from ? { $gte: publishedDay(options.from) } : {}),
      ...(options.to ? { $lte: publishedDay(options.to) } : {}),
    };
  }
  const [vector] = embedded.Vectors;
  const result = await deps.Current.Index.query(vector ?? [], {
    topK,
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    returnMetadata: "none",
  });
  return {
    Ok: true,
    Hits: result.matches.map((match) => ({ PublicationId: match.id, Score: match.score })),
  };
}
