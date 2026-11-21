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

export type StoredDocument = {
  id: string;
  publication_id: string;
  pdf_r2_key: string;
  license: string;
  status: string;
};

export async function findDocumentById(
  db: SqlDatabase,
  documentId: string,
): Promise<StoredDocument | null> {
  return db
    .prepare("SELECT id, publication_id, pdf_r2_key, license, status FROM document WHERE id = ?")
    .bind(documentId)
    .first<StoredDocument>();
}

/** Document states after text extraction; neither changes again (REQ-DATA-006). */
export const FINAL_TEXT_STATES = ["text-extracted", "text-failed"] as const;

/**
 * Stored PDFs that still need their text: status `stored`, and no text message that
 * finished or was dead-lettered. The oldest come first, so a backfill works through them in
 * order across runs.
 */
export async function documentsAwaitingText(
  db: SqlDatabase,
  limit: number,
): Promise<Array<{ id: string; publication_id: string }>> {
  const { results } = await db
    .prepare(
      `SELECT d.id AS id, d.publication_id AS publication_id FROM document d
       WHERE d.status = 'stored'
         AND NOT EXISTS (
           SELECT 1 FROM queue_message_log q
           WHERE q.message_id = 'text:' || d.id AND q.status IN ('completed', 'dead-lettered')
         )
       ORDER BY d.stored_at, d.id
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; publication_id: string }>();
  return results;
}
