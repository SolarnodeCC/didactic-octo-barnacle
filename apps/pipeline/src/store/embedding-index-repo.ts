import { REFERENCE_EMBEDDING, type IndexEntry } from "@roi/vector-store";

import { type SqlDatabase } from "./sql.js";

/** ID of the first index of the registry: the reference model of ADR 0010. */
export const FIRST_INDEX_ID = "idx_bge_base_768";

type IndexRow = {
  id: string;
  binding: string;
  vectorize_name: string;
  model_name: string;
  model_version: string;
  dimensions: number;
  metric: IndexEntry["Metric"];
  current: number;
};

/**
 * The index registry of ADR 0056. While it is empty, it is seeded with the index bootstrap
 * creates: `roi-publications-<env>` for `bge-base-en-v1.5`, bound as `PUBLICATION_VECTORS`, and
 * current. Seeded in code rather than by a migration, because a migration does not know the
 * environment. A model change adds its row by a reviewed migration (ADR 0056).
 */
export async function registryIndexes(db: SqlDatabase, environment: string): Promise<IndexEntry[]> {
  await db
    .prepare(
      `INSERT INTO embedding_index (id, binding, vectorize_name, model_name, model_version,
         dimensions, metric, current)
       SELECT ?, 'PUBLICATION_VECTORS', ?, ?, ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM embedding_index)`,
    )
    .bind(
      FIRST_INDEX_ID,
      `roi-publications-${environment}`,
      REFERENCE_EMBEDDING.Model,
      REFERENCE_EMBEDDING.Version,
      REFERENCE_EMBEDDING.Dimensions,
      REFERENCE_EMBEDDING.Metric,
    )
    .run();
  const { results } = await db
    .prepare(
      `SELECT id, binding, vectorize_name, model_name, model_version, dimensions, metric, current
       FROM embedding_index ORDER BY current DESC, id`,
    )
    .all<IndexRow>();
  return results.map((row) => ({
    Id: row.id,
    Binding: row.binding,
    VectorizeName: row.vectorize_name,
    ModelName: row.model_name,
    ModelVersion: row.model_version,
    Dimensions: row.dimensions,
    Metric: row.metric,
    Current: row.current === 1,
  }));
}
