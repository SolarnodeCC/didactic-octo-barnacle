import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { type SqlDatabase, type SqlStatement, type SqlValue } from "../store/sql.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../infrastructure/cloudflare/migrations",
);

/**
 * Round trips to the database, as D1 would count them: each `run`, `first`, or `all` is
 * one, and a `batch` is one however many statements it holds (REQ-NFR-010).
 */
export type RoundTrips = { Queries: number; Batches: number; BatchedStatements: number };

class SqliteStatement implements SqlStatement {
  constructor(
    private readonly db: Database.Database,
    readonly Sql: string,
    private readonly trips: RoundTrips,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): SqlStatement {
    return new SqliteStatement(this.db, this.Sql, this.trips, values);
  }

  runSync(): void {
    this.db.prepare(this.Sql).run(...this.values);
  }

  run(): Promise<unknown> {
    this.trips.Queries += 1;
    this.runSync();
    return Promise.resolve({});
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    this.trips.Queries += 1;
    const row = this.db.prepare(this.Sql).get(...this.values) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    this.trips.Queries += 1;
    return Promise.resolve({ results: this.db.prepare(this.Sql).all(...this.values) as T[] });
  }
}

export type TestDatabase = {
  Db: SqlDatabase;
  Raw: Database.Database;
  /** Counters since the database was created; reset them by assigning zero. */
  Trips: RoundTrips;
};

/**
 * An in-memory SQLite database with the real migrations applied, standing in for D1
 * (REQ-NFR-020). Foreign keys are on, as in D1.
 */
export function createTestDatabase(): TestDatabase {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/u.test(file))
    .sort()) {
    raw.exec(readFileSync(join(migrationsDir, name), "utf8"));
  }

  const trips: RoundTrips = { Queries: 0, Batches: 0, BatchedStatements: 0 };
  const db: SqlDatabase = {
    prepare: (sql) => new SqliteStatement(raw, sql, trips),
    batch: (statements) => {
      trips.Batches += 1;
      trips.BatchedStatements += statements.length;
      raw.transaction(() => {
        for (const statement of statements) {
          (statement as SqliteStatement).runSync();
        }
      })();
      return Promise.resolve([]);
    },
  };
  return { Db: db, Raw: raw, Trips: trips };
}

export function counter(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}${(next += 1)}`;
}
