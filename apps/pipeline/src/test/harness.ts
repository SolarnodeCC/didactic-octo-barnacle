import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeQueue } from "./fake-queue.js";
import { counter, createTestDatabase, type TestDatabase } from "./sqlite-d1.js";
import { type ArxivPage } from "../collectors/arxiv/client.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { type OpenAlexPage } from "../collectors/openalex/client.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { DEFAULT_INGEST_CONFIG, type IngestConfig } from "../config.js";
import { consumeBatch } from "../queue/consume.js";
import { type PipelineDeps } from "../queue/deps.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const baseWork = JSON.parse(
  readFileSync(join(fixtures, "openalex", "work-complete.json"), "utf8"),
) as OpenAlexWork;

/** A complete OpenAlex work with its own IDs, so works never merge with each other. */
export function makeWork(n: number): OpenAlexWork {
  return {
    ...baseWork,
    id: `https://openalex.org/W${n}`,
    title: `Opportunity research paper number ${n}`,
    doi: `https://doi.org/10.1000/paper.${n}`,
    ids: { openalex: `https://openalex.org/W${n}`, doi: `https://doi.org/10.1000/paper.${n}` },
  };
}

/** A work the mapper cannot store, to prove one bad item does not stop a page. */
export function makeBrokenWork(): OpenAlexWork {
  return { title: "No id at all" } as unknown as OpenAlexWork;
}

export function makeEntry(n: number, updated: string): ArxivEntry {
  return {
    id: `http://arxiv.org/abs/2410.${String(n).padStart(5, "0")}v1`,
    title: `Preprint number ${n}`,
    summary: `Abstract of preprint ${n}.`,
    published: updated,
    updated,
    categories: ["cs.AI"],
    primaryCategory: "cs.AI",
    authors: [{ name: `Author ${n}` }],
  };
}

export type Harness = {
  Database: TestDatabase;
  Queue: FakeQueue;
  Deps: PipelineDeps;
  Clock: { Now: string };
  OpenAlexRequests: Array<{ FromDate: string; Cursor?: string }>;
  ArxivRequests: Array<{ Start: number; MaxResults: number }>;
  /** Replace the scripted OpenAlex pages; each call to the client takes the next one. */
  SetOpenAlexPages(pages: Array<OpenAlexPage | Error>): void;
  SetArxivPages(pages: Array<ArxivPage | Error>): void;
  Drain(options?: { Duplicate?: boolean; MaxRetries?: number }): Promise<number>;
  Count(table: string): number;
  Run(id?: string): Record<string, unknown>;
};

export function createHarness(config: Partial<IngestConfig> = {}): Harness {
  const database = createTestDatabase();
  const queue = new FakeQueue();
  const clock = { Now: "2026-10-30T06:00:00.000Z" };
  const ids = counter("id");
  let openAlexPages: Array<OpenAlexPage | Error> = [];
  let arxivPages: Array<ArxivPage | Error> = [];
  const openAlexRequests: Harness["OpenAlexRequests"] = [];
  const arxivRequests: Harness["ArxivRequests"] = [];

  const take = <T>(pages: Array<T | Error>, label: string): Promise<T> => {
    const next = pages.shift();
    if (next === undefined) {
      return Promise.reject(new Error(`no scripted ${label} page left`));
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };

  const deps: PipelineDeps = {
    Db: database.Db,
    Queue: queue,
    Now: () => clock.Now,
    NewId: ids,
    Config: { ...DEFAULT_INGEST_CONFIG, ...config },
    Sources: {
      FetchOpenAlexPage: (request) => {
        openAlexRequests.push(request);
        return take(openAlexPages, "OpenAlex");
      },
      FetchArxivPage: (request) => {
        arxivRequests.push(request);
        return take(arxivPages, "arXiv");
      },
    },
  };

  return {
    Database: database,
    Queue: queue,
    Deps: deps,
    Clock: clock,
    OpenAlexRequests: openAlexRequests,
    ArxivRequests: arxivRequests,
    SetOpenAlexPages: (pages) => {
      openAlexPages = [...pages];
    },
    SetArxivPages: (pages) => {
      arxivPages = [...pages];
    },
    Drain: (options = {}) =>
      queue.drain({
        MaxRetries: options.MaxRetries ?? 3,
        ...(options.Duplicate ? { Duplicate: true } : {}),
        Consume: (batch) => consumeBatch(deps, batch),
      }),
    Count: (table) =>
      (database.Raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    Run: (id) =>
      database.Raw.prepare(
        id
          ? "SELECT * FROM ingestion_run WHERE id = ?"
          : "SELECT * FROM ingestion_run ORDER BY started_at DESC LIMIT 1",
      ).get(...(id ? [id] : [])) as Record<string, unknown>,
  };
}

export function openAlexPage(works: OpenAlexWork[], nextCursor: string | null): OpenAlexPage {
  return { Works: works, NextCursor: nextCursor };
}

export function arxivPage(entries: ArxivEntry[], returned = entries.length): ArxivPage {
  return { Entries: entries, OutOfScope: returned - entries.length, Returned: returned };
}
