/**
 * The slice of the Cloudflare D1 API the read route uses. `D1Database` satisfies it
 * structurally; tests and the `slice` command pass a better-sqlite3 adapter. Same shape as
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
