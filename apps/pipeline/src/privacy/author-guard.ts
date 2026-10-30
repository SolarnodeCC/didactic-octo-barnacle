import { type AuthorKeyHasher } from "./author-key.js";
import { type SqlDatabase } from "../store/sql.js";

/** Tells ingestion which authors were erased and must not be stored again. */
export interface AuthorGuard {
  /** Of these stored author IDs, the ones on the erasure list. */
  Suppressed(authorIds: string[]): Promise<Set<string>>;
}

/** D1 allows 100 bound values per query. */
const CHUNK = 40;

export function createAuthorGuard(db: SqlDatabase, hash: AuthorKeyHasher): AuthorGuard {
  return {
    async Suppressed(authorIds) {
      const suppressed = new Set<string>();
      const unique = [...new Set(authorIds)];
      for (let start = 0; start < unique.length; start += CHUNK) {
        const chunk = unique.slice(start, start + CHUNK);
        const hashes = new Map<string, string>();
        for (const id of chunk) {
          hashes.set(await hash(id), id);
        }
        const marks = [...hashes.keys()].map(() => "?").join(", ");
        const { results } = await db
          .prepare(`SELECT subject_hash FROM author_erasure WHERE subject_hash IN (${marks})`)
          .bind(...hashes.keys())
          .all<{ subject_hash: string }>();
        for (const row of results) {
          const id = hashes.get(row.subject_hash);
          if (id) {
            suppressed.add(id);
          }
        }
      }
      return suppressed;
    },
  };
}
