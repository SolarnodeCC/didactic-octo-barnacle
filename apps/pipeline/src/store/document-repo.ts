import { normalizePdfLicense } from "../normalize/license.js";
import { type SqlDatabase } from "./sql.js";

/** D1 allows 100 bound values per query. */
const CHUNK = 50;

/**
 * Of these publications, the ones that still need a `document.ingest` message: no stored
 * document, and no message that already finished or was dead-lettered. A repeated page
 * (the overlap window) therefore queues nothing new.
 */
export async function pendingDocumentIds(
  db: SqlDatabase,
  publicationIds: string[],
): Promise<string[]> {
  const unique = [...new Set(publicationIds)];
  const pending: string[] = [];
  for (let start = 0; start < unique.length; start += CHUNK) {
    const chunk = unique.slice(start, start + CHUNK);
    const marks = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT p.id AS id FROM publication p
         WHERE p.id IN (${marks})
           AND NOT EXISTS (SELECT 1 FROM document d WHERE d.publication_id = p.id)
           AND NOT EXISTS (
             SELECT 1 FROM queue_message_log q
             WHERE q.message_id = 'document:' || p.id AND q.status IN ('completed', 'dead-lettered')
           )`,
      )
      .bind(...chunk)
      .all<{ id: string }>();
    pending.push(...results.map((row) => row.id));
  }
  return pending;
}

export type StorableSource = {
  Url: string;
  License: ReturnType<typeof normalizePdfLicense> & string;
};

/**
 * The source record to take the PDF from: it has a PDF URL and a recorded license that
 * allows storage (REQ-DATA-004 AC1, REQ-DATA-010 AC2 and AC4). OpenAlex comes first.
 */
export async function findStorableSource(
  db: SqlDatabase,
  publicationId: string,
): Promise<StorableSource | null> {
  const { results } = await db
    .prepare(
      "SELECT pdf_url, pdf_license FROM source_record WHERE publication_id = ? AND pdf_url IS NOT NULL ORDER BY (source = 'openalex') DESC, source_work_id",
    )
    .bind(publicationId)
    .all<{ pdf_url: string; pdf_license: string | null }>();
  for (const row of results) {
    const license = normalizePdfLicense(row.pdf_license);
    if (license) {
      return { Url: row.pdf_url, License: license };
    }
  }
  return null;
}

export async function findDocumentByPublication(
  db: SqlDatabase,
  publicationId: string,
): Promise<{ id: string } | null> {
  return db
    .prepare("SELECT id FROM document WHERE publication_id = ?")
    .bind(publicationId)
    .first<{ id: string }>();
}

export async function findDocumentByHash(
  db: SqlDatabase,
  contentHash: string,
): Promise<{ publication_id: string } | null> {
  return db
    .prepare("SELECT publication_id FROM document WHERE content_hash = ?")
    .bind(contentHash)
    .first<{ publication_id: string }>();
}
