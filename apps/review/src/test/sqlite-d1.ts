import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { type SqlDatabase, type SqlStatement, type SqlValue } from "../sql.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../infrastructure/cloudflare/migrations",
);

class SqliteStatement implements SqlStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): SqlStatement {
    return new SqliteStatement(this.db, this.sql, values);
  }

  runSync(): void {
    this.db.prepare(this.sql).run(...this.values);
  }

  run(): Promise<unknown> {
    this.runSync();
    return Promise.resolve({});
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return Promise.resolve({ results: this.db.prepare(this.sql).all(...this.values) as T[] });
  }
}

/** An in-memory SQLite database with the real migrations applied, standing in for D1. */
export function createTestDatabase(): { Db: SqlDatabase; Raw: Database.Database } {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/u.test(file))
    .sort()) {
    raw.exec(readFileSync(join(migrationsDir, name), "utf8"));
  }
  const db: SqlDatabase = {
    prepare: (sql) => new SqliteStatement(raw, sql),
    batch: (statements) => {
      raw.transaction(() => {
        for (const statement of statements) {
          (statement as SqliteStatement).runSync();
        }
      })();
      return Promise.resolve([]);
    },
  };
  return { Db: db, Raw: raw };
}

const NOW = "2026-11-20T10:00:00.000Z";

/** A publication with an abstract; `n` keeps IDs apart. */
export function insertPublication(
  raw: Database.Database,
  n: number,
  options: { Abstract?: string; Title?: string } = {},
): string {
  const id = `pub-${n}`;
  raw
    .prepare(
      `INSERT INTO publication (id, title, abstract, published_at, doi, arxiv_id, completeness, created_at, updated_at)
       VALUES (?, ?, ?, '2026-11-01', ?, ?, 'complete', ?, ?)`,
    )
    .run(
      id,
      options.Title ?? `Paper ${n}`,
      options.Abstract ?? `Abstract of paper ${n}.`,
      `10.1000/paper.${n}`,
      `2611.0000${n}`,
      NOW,
      NOW,
    );
  return id;
}

/** A model triage decision: accepted with all signals, or rejected for a low score. */
export function insertTriage(
  raw: Database.Database,
  publicationId: string,
  options: { Accepted: boolean; CreatedAt: string; PromptVersion?: string },
): string {
  const id = `triage-${publicationId}`;
  const signal = options.Accepted ? 1 : 0;
  raw
    .prepare(
      `INSERT INTO triage_decision (
        id, publication_id, run_id, status, accepted, score, reason, signal_named_party,
        signal_stated_harm, signal_trigger, signal_existing_alternative, signal_adoptable, notes,
        model, prompt_version, admitted_on, created_at, updated_at
      ) VALUES (?, ?, 'run-1', 'decided', ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'model-a', ?, ?, ?, ?)`,
    )
    .run(
      id,
      publicationId,
      signal,
      options.Accepted ? 0.8 : 0.2,
      options.Accepted ? "accepted" : "low-score",
      signal,
      signal,
      signal,
      0,
      signal,
      options.PromptVersion ?? "triage-v1",
      options.Accepted ? options.CreatedAt.slice(0, 10) : null,
      options.CreatedAt,
      options.CreatedAt,
    );
  return id;
}

/** An extraction result with one candidate per given quote set. */
export function insertExtraction(
  raw: Database.Database,
  publicationId: string,
  candidates: { Finding: string; EvidenceQuote: string; CustomerQuote: string; Hidden?: boolean }[],
): string[] {
  const resultId = `extraction-${publicationId}`;
  raw
    .prepare(
      `INSERT INTO extraction_result (id, publication_id, run_id, model, prompt_version, input_mode,
        confidence, notes, candidate_count, created_at)
       VALUES (?, ?, 'run-1', 'model-b', 'extraction-v1', 'abstract', 0.6, NULL, ?, ?)`,
    )
    .run(resultId, publicationId, candidates.length, NOW);
  return candidates.map((candidate, index) => {
    const id = `cand-${publicationId}-${index + 1}`;
    raw
      .prepare(
        `INSERT INTO candidate (id, publication_id, extraction_result_id, finding, evidence_quote,
          customer, customer_quote, why_now, why_now_quote, current_alternative, alternative_quote,
          hidden_reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'Hospital pharmacists', ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        publicationId,
        resultId,
        candidate.Finding,
        candidate.EvidenceQuote,
        candidate.CustomerQuote,
        candidate.Hidden ? "retracted" : null,
        NOW,
      );
    return id;
  });
}
