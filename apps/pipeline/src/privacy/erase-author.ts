import { ErasureReasonSchema, ErasureRecordSchema, type ErasureReason } from "@roi/models";

import { type AuthorKeyHasher } from "./author-key.js";
import { type ObjectStore } from "../documents/object-store.js";
import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

export type ErasureDeps = {
  Db: SqlDatabase;
  /** The bucket also holds the durable erasure list, which a database restore cannot undo. */
  Documents: ObjectStore;
  Now: () => string;
  NewId: () => string;
  HashAuthorId: AuthorKeyHasher;
  Log?: (event: string, fields: Record<string, unknown>) => void;
};

export type EraseOutcome =
  | {
      Outcome: "erased";
      ErasureId: string;
      AuthorshipsRemoved: number;
      PublicationsUpdated: number;
    }
  | { Outcome: "already-erased"; ErasureId: string }
  | { Outcome: "not-found" };

const ERASURE_PREFIX = "erasures/";

async function count(db: SqlDatabase, sql: string, values: string[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Statements that remove an author's personal data. The title-and-first-author key of the
 * author's publications is cleared too: it holds the first author's normalized name.
 */
function removalStatements(db: SqlDatabase, authorId: string, now: string): SqlStatement[] {
  return [
    db
      .prepare(
        "UPDATE publication SET title_author_key = NULL, updated_at = ? WHERE id IN (SELECT publication_id FROM authorship WHERE author_id = ?)",
      )
      .bind(now, authorId),
    db.prepare("DELETE FROM authorship WHERE author_id = ?").bind(authorId),
    db.prepare("DELETE FROM author WHERE id = ?").bind(authorId),
  ];
}

/**
 * Author IDs that match an ORCID or an exact name (any letter case). A request names a
 * person, but erasure goes by stored author ID: an arXiv author has one record per paper.
 */
export async function findAuthorIds(
  db: SqlDatabase,
  query: { Orcid?: string; Name?: string },
): Promise<string[]> {
  const orcid = query.Orcid?.replace(/^https?:\/\/orcid\.org\//i, "").trim();
  const name = query.Name?.trim();
  if (!orcid && !name) {
    return [];
  }
  const { results } = await db
    .prepare(
      "SELECT id FROM author WHERE (? IS NOT NULL AND orcid = ?) OR (? IS NOT NULL AND lower(display_name) = lower(?)) ORDER BY id",
    )
    .bind(orcid ?? null, orcid ?? null, name ?? null, name ?? null)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

/**
 * Erases one author on request (REQ-NFR-016 AC2): the author record and every affiliation
 * go, the publications stay. The author is also put on the erasure list, so the next
 * ingestion does not store them again, and an audit event is written. Neither holds the
 * name, ORCID, or affiliation: the list holds a keyed hash, the event holds counts and a
 * reason code. The same list is kept in the bucket, so a database restore can be redone.
 * The HTTP route `POST /admin/authors/:id/erase` wraps this with the admin API in phase 4.
 */
export async function eraseAuthor(
  deps: ErasureDeps,
  authorId: string,
  options: { Reason: ErasureReason; Actor: string },
): Promise<EraseOutcome> {
  const reason = ErasureReasonSchema.parse(options.Reason);
  const hash = await deps.HashAuthorId(authorId);
  const known = await deps.Db.prepare("SELECT id FROM author WHERE id = ?")
    .bind(authorId)
    .first<{ id: string }>();
  const tombstone = await deps.Db.prepare("SELECT id FROM author_erasure WHERE subject_hash = ?")
    .bind(hash)
    .first<{ id: string }>();

  if (!known) {
    return tombstone
      ? { Outcome: "already-erased", ErasureId: tombstone.id }
      : { Outcome: "not-found" };
  }

  const now = deps.Now();
  const erasureId = tombstone?.id ?? `era_${deps.NewId()}`;
  const authorshipsRemoved = await count(
    deps.Db,
    "SELECT COUNT(*) AS n FROM authorship WHERE author_id = ?",
    [authorId],
  );
  const publicationsUpdated = authorshipsRemoved;

  if (!tombstone) {
    // The bucket first: if the database write fails, a retry finds the list entry.
    const record = { ErasureId: erasureId, SubjectHash: hash, Reason: reason, ErasedAt: now };
    await deps.Documents.put(
      `${ERASURE_PREFIX}${hash}.json`,
      new TextEncoder().encode(JSON.stringify(record)),
      { httpMetadata: { contentType: "application/json" } },
    );
  }

  await deps.Db.batch([
    ...removalStatements(deps.Db, authorId, now),
    deps.Db.prepare(
      "INSERT INTO author_erasure (id, subject_hash, reason, erased_at) VALUES (?, ?, ?, ?) ON CONFLICT (subject_hash) DO NOTHING",
    ).bind(erasureId, hash, reason, now),
    deps.Db.prepare(
      "INSERT INTO audit_event (id, organization_id, actor_id_opaque, action, created_at, meta_json) VALUES (?, NULL, ?, 'author.erased', ?, ?)",
    ).bind(
      `aud_${deps.NewId()}`,
      options.Actor,
      now,
      JSON.stringify({
        ErasureId: erasureId,
        Reason: reason,
        AuthorshipsRemoved: authorshipsRemoved,
        PublicationsUpdated: publicationsUpdated,
      }),
    ),
  ]);

  deps.Log?.("author.erased", { erasureId, reason, authorshipsRemoved });
  return {
    Outcome: "erased",
    ErasureId: erasureId,
    AuthorshipsRemoved: authorshipsRemoved,
    PublicationsUpdated: publicationsUpdated,
  };
}

export type ReapplyResult = { ListEntries: number; AuthorsRemoved: number };

/**
 * After a database restore, applies every erasure made since the restore point again
 * (REQ-NFR-015 AC3). It reads the durable list from the bucket, puts missing entries back
 * into the database, and removes any listed author the restored data brought back.
 */
export async function reapplyErasures(
  deps: Omit<ErasureDeps, "NewId"> & { NewId: () => string },
): Promise<ReapplyResult> {
  const now = deps.Now();
  const listed = new Set<string>();

  let cursor: string | undefined;
  do {
    const page = await deps.Documents.list({
      prefix: ERASURE_PREFIX,
      ...(cursor ? { cursor } : {}),
    });
    for (const object of page.objects) {
      const text = await (await deps.Documents.get(object.key))?.text();
      const parsed = ErasureRecordSchema.safeParse(text ? JSON.parse(text) : null);
      if (!parsed.success) {
        deps.Log?.("author.erasure_entry_unreadable", { key: object.key });
        continue;
      }
      const entry = parsed.data;
      listed.add(entry.SubjectHash);
      await deps.Db.prepare(
        "INSERT INTO author_erasure (id, subject_hash, reason, erased_at) VALUES (?, ?, ?, ?) ON CONFLICT (subject_hash) DO NOTHING",
      )
        .bind(entry.ErasureId, entry.SubjectHash, entry.Reason, entry.ErasedAt)
        .run();
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  let removed = 0;
  const { results } = await deps.Db.prepare("SELECT id FROM author").all<{ id: string }>();
  for (const { id } of results) {
    if (listed.has(await deps.HashAuthorId(id))) {
      await deps.Db.batch(removalStatements(deps.Db, id, now));
      removed += 1;
    }
  }
  if (removed > 0) {
    await deps.Db.prepare(
      "INSERT INTO audit_event (id, organization_id, actor_id_opaque, action, created_at, meta_json) VALUES (?, NULL, 'system', 'author.erasure_reapplied', ?, ?)",
    )
      .bind(`aud_${deps.NewId()}`, now, JSON.stringify({ AuthorsRemoved: removed }))
      .run();
  }
  deps.Log?.("author.erasures_reapplied", { entries: listed.size, removed });
  return { ListEntries: listed.size, AuthorsRemoved: removed };
}
