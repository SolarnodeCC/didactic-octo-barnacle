import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeBucket } from "./fake-bucket.js";
import { FakeQueue } from "./fake-queue.js";
import { counter, createTestDatabase, type TestDatabase } from "./sqlite-d1.js";
import { type ArxivPage } from "../collectors/arxiv/client.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { type OpenAlexPage } from "../collectors/openalex/client.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { DEFAULT_INGEST_CONFIG, type IngestConfig } from "../config.js";
import { type FetchedPdf } from "../documents/safe-fetch.js";
import { consumeBatch } from "../queue/consume.js";
import { createAuthorGuard } from "../privacy/author-guard.js";
import { createAuthorKeyHasher, type AuthorKeyHasher } from "../privacy/author-key.js";
import { type ErasureDeps } from "../privacy/erase-author.js";
import { type PipelineDeps } from "../queue/deps.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const baseWork = JSON.parse(
  readFileSync(join(fixtures, "openalex", "work-complete.json"), "utf8"),
) as OpenAlexWork;

/** A complete OpenAlex work with its own IDs, so works never merge with each other. */
export function makeWork(
  n: number,
  options: { Pdf?: { Url: string | null; License: string | null }; OaUrl?: string } = {},
): OpenAlexWork {
  return {
    ...baseWork,
    id: `https://openalex.org/W${n}`,
    title: `Opportunity research paper number ${n}`,
    doi: `https://doi.org/10.1000/paper.${n}`,
    ids: { openalex: `https://openalex.org/W${n}`, doi: `https://doi.org/10.1000/paper.${n}` },
    // No PDF unless asked for, so tests that are not about documents queue none.
    open_access: { is_oa: Boolean(options.OaUrl), oa_url: options.OaUrl ?? null },
    primary_location: {
      license: options.Pdf?.License ?? null,
      pdf_url: options.Pdf?.Url ?? null,
      landing_page_url: `https://example.org/landing/${n}`,
    },
  };
}

/** A work the mapper cannot store, to prove one bad item does not stop a page. */
export function makeBrokenWork(): OpenAlexWork {
  return { title: "No id at all", topics: baseWork.topics } as unknown as OpenAlexWork;
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
  Bucket: FakeBucket;
  /** URLs the PDF fetcher was asked for. */
  PdfRequests: string[];
  Deps: PipelineDeps;
  /** What `eraseAuthor` and `reapplyErasures` need, on the same database and bucket. */
  Erasure: ErasureDeps;
  Clock: { Now: string };
  OpenAlexRequests: Array<{ FromDate: string; Cursor?: string }>;
  ArxivRequests: Array<{ Start: number; MaxResults: number }>;
  /** Replace the scripted OpenAlex pages; each call to the client takes the next one. */
  SetOpenAlexPages(pages: Array<OpenAlexPage | Error>): void;
  SetArxivPages(pages: Array<ArxivPage | Error>): void;
  /** Script the PDF fetcher: bytes, or an error, per URL. */
  SetPdfs(pdfs: Record<string, Uint8Array | Error>): void;
  Drain(options?: { Duplicate?: boolean; MaxRetries?: number }): Promise<number>;
  Count(table: string): number;
  Run(id?: string): Record<string, unknown>;
};

export function createHarness(
  config: Partial<IngestConfig> = {},
  overrides: {
    FetchPdf?: PipelineDeps["FetchPdf"];
    /** The erasure key; `null` leaves it unset, as in a misconfigured Worker. */
    AuthorKey?: string | null;
  } = {},
): Harness {
  const database = createTestDatabase();
  const queue = new FakeQueue();
  const bucket = new FakeBucket();
  const pdfRequests: string[] = [];
  let pdfs: Record<string, Uint8Array | Error> = {};
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

  const hashAuthorId: AuthorKeyHasher = createAuthorKeyHasher(
    overrides.AuthorKey === null
      ? undefined
      : (overrides.AuthorKey ?? "test-erasure-key-0123456789abcdef0123"),
  );
  const deps: PipelineDeps = {
    AuthorGuard: createAuthorGuard(database.Db, hashAuthorId),
    Db: database.Db,
    Queue: queue,
    Now: () => clock.Now,
    NewId: ids,
    Config: { ...DEFAULT_INGEST_CONFIG, ...config },
    Documents: bucket,
    FetchPdf:
      overrides.FetchPdf ??
      ((url): Promise<FetchedPdf> => {
        pdfRequests.push(url);
        const next = pdfs[url];
        if (next === undefined) {
          return Promise.reject(new Error(`no scripted PDF for ${url}`));
        }
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve({ Bytes: next, FinalUrl: url });
      }),
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
    Bucket: bucket,
    PdfRequests: pdfRequests,
    Deps: deps,
    Erasure: {
      Db: database.Db,
      Documents: bucket,
      Now: () => clock.Now,
      NewId: ids,
      HashAuthorId: hashAuthorId,
    },
    Clock: clock,
    OpenAlexRequests: openAlexRequests,
    ArxivRequests: arxivRequests,
    SetOpenAlexPages: (pages) => {
      openAlexPages = [...pages];
    },
    SetArxivPages: (pages) => {
      arxivPages = [...pages];
    },
    SetPdfs: (next) => {
      pdfs = { ...next };
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

/** A small file that passes the PDF magic-byte check; the label makes its hash unique. */
export function pdfBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${label}\n%%EOF`);
}

/**
 * Every value in every table and every object in the bucket as one text, to prove that a
 * string (a name, an ORCID) is nowhere in the stored data.
 */
export function everythingStored(harness: Harness): string {
  const raw = harness.Database.Raw;
  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  const rows = tables.map(({ name }) => JSON.stringify(raw.prepare(`SELECT * FROM ${name}`).all()));
  const objects = [...harness.Bucket.objects.entries()].map(
    ([key, value]) => `${key} ${new TextDecoder().decode(value.bytes)}`,
  );
  return [...rows, ...objects].join("\n");
}
