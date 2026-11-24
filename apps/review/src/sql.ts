/**
 * The slice of the Cloudflare D1 API the review tool uses. `D1Database` satisfies it
 * structurally; tests use a better-sqlite3 adapter (src/test/sqlite-d1.ts). Same shape as
 * `apps/pipeline/src/store/sql.ts`.
 */
export type SqlValue = string | number | null;

export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}
