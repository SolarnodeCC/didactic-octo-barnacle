import {
  missingPublicationFields,
  stripArxivVersion,
  titleAuthorReviewKey,
  type Author,
  type Authorship,
  type Publication,
  type SourceRecord,
} from "@roi/models";

import { decideMerge } from "../normalize/dedupe-merge.js";
import { type SqlDatabase, type SqlStatement, type SqlValue } from "./sql.js";

/** What both source mappers produce (REQ-DATA-005); OpenAlex also lists its work IDs. */
export type MappedRecord = {
  Publication: Omit<Publication, "Id" | "CreatedAt" | "UpdatedAt">;
  SourceRecord: Omit<SourceRecord, "Id" | "PublicationId">;
  Authors: Array<Omit<Author, "Id"> & { SourceAuthorId: string }>;
  Authorships: Array<Omit<Authorship, "PublicationId" | "AuthorId"> & { SourceAuthorId: string }>;
  OpenAlexIds?: string[];
};

export type UpsertDeps = {
  Now: () => string;
  NewId: () => string;
  /** Of these author IDs, the ones erased on request; they are not stored again (REQ-NFR-016). */
  SuppressedAuthors?: (authorIds: string[]) => Promise<Set<string>>;
};

export type UpsertResult = {
  Outcome: "created" | "updated" | "unchanged";
  PublicationId: string;
  /** Set when a title-and-first-author match was flagged instead of merged (REQ-DATA-007 AC3). */
  ReviewFlagged: boolean;
};

type PublicationRow = {
  id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
  doi: string | null;
  arxiv_id: string | null;
  arxiv_version: number | null;
  citation_count: number;
  completeness: "complete" | "incomplete";
  retracted: number;
  topics_json: string;
  missing_fields_json: string;
  language: string | null;
  has_storable_pdf: number;
  title_author_key: string | null;
};

type AuthorshipRow = {
  author_id: string;
  position: number;
  affiliations_json: string;
};

const PUBLICATION_COLUMNS =
  "id, title, abstract, published_at, doi, arxiv_id, arxiv_version, citation_count, completeness, retracted, topics_json, missing_fields_json, language, has_storable_pdf, title_author_key";

const PLACEHOLDER_TITLE = "Untitled";

function bareOrcid(orcid: string): string {
  return orcid.replace(/^https?:\/\/orcid\.org\//i, "");
}

/** Author IDs come from the ORCID when there is one, so the same person is one row. */
function authorId(author: { SourceAuthorId: string; Orcid: string | null }): string {
  return author.Orcid ? `orcid:${bareOrcid(author.Orcid)}` : `src:${author.SourceAuthorId}`;
}

/**
 * arXiv versions of one preprint share a source record, so a new version refreshes
 * it instead of linking a second record (REQ-DATA-002 AC3). The version number is
 * kept on the publication.
 */
function sourceWorkId(source: SourceRecord["Source"], sourceId: string): string {
  return source === "arxiv" ? stripArxivVersion(sourceId) : sourceId;
}

function pick<T>(existing: T | null, incoming: T | null, preferIncoming: boolean): T | null {
  return preferIncoming ? (incoming ?? existing) : (existing ?? incoming);
}

function mergedTitle(existing: string | null, incoming: string, preferIncoming: boolean): string {
  const incomingTitle = incoming === PLACEHOLDER_TITLE ? null : incoming;
  const existingTitle = existing === PLACEHOLDER_TITLE ? null : existing;
  return pick(existingTitle, incomingTitle, preferIncoming) ?? PLACEHOLDER_TITLE;
}

function union(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])];
}

async function loadPublication(db: SqlDatabase, id: string): Promise<PublicationRow | null> {
  return db
    .prepare(`SELECT ${PUBLICATION_COLUMNS} FROM publication WHERE id = ?`)
    .bind(id)
    .first<PublicationRow>();
}

async function findIds(db: SqlDatabase, sql: string, values: SqlValue[]): Promise<string[]> {
  const { results } = await db
    .prepare(sql)
    .bind(...values)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

/** Candidate publications in the REQ-DATA-007 order: DOI, arXiv ID, OpenAlex IDs, title key. */
async function findCandidateIds(
  db: SqlDatabase,
  mapped: MappedRecord,
  titleKey: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  const { Doi, ArxivId } = mapped.Publication;
  if (Doi) {
    ids.push(...(await findIds(db, "SELECT id FROM publication WHERE doi = ?", [Doi])));
  }
  if (ArxivId) {
    ids.push(...(await findIds(db, "SELECT id FROM publication WHERE arxiv_id = ?", [ArxivId])));
  }
  const openAlexIds = (mapped.OpenAlexIds ?? []).map((id) => id.toLowerCase());
  if (openAlexIds.length > 0) {
    const marks = openAlexIds.map(() => "?").join(", ");
    ids.push(
      ...(await findIds(
        db,
        `SELECT DISTINCT publication_id AS id FROM source_record WHERE source = 'openalex' AND lower(source_work_id) IN (${marks})`,
        openAlexIds,
      )),
    );
  }
  if (titleKey) {
    ids.push(
      ...(await findIds(db, "SELECT id FROM publication WHERE title_author_key = ?", [titleKey])),
    );
  }
  return [...new Set(ids)];
}

async function firstAuthorName(db: SqlDatabase, publicationId: string): Promise<string> {
  const row = await db
    .prepare(
      "SELECT a.display_name AS name FROM authorship s JOIN author a ON a.id = s.author_id WHERE s.publication_id = ? ORDER BY s.position LIMIT 1",
    )
    .bind(publicationId)
    .first<{ name: string }>();
  return row?.name ?? "";
}

async function sourcesOf(
  db: SqlDatabase,
  publicationId: string,
): Promise<Array<{ source: string; source_work_id: string }>> {
  const { results } = await db
    .prepare("SELECT source, source_work_id FROM source_record WHERE publication_id = ?")
    .bind(publicationId)
    .all<{ source: string; source_work_id: string }>();
  return results;
}

type Target =
  | { Kind: "create"; ReviewAgainst: string | null }
  | { Kind: "refresh" | "merge"; PublicationId: string };

/**
 * Decide where an incoming record goes: its own source record (a refresh), an
 * existing publication (merge), or a new publication (REQ-DATA-007).
 */
async function chooseTarget(
  db: SqlDatabase,
  mapped: MappedRecord,
  titleKey: string | null,
  firstAuthor: string,
): Promise<Target> {
  const { Source, SourceId } = mapped.SourceRecord;
  const own = await db
    .prepare(
      "SELECT publication_id AS id FROM source_record WHERE source = ? AND source_work_id = ?",
    )
    .bind(Source, sourceWorkId(Source, SourceId))
    .first<{ id: string }>();
  if (own) {
    return { Kind: "refresh", PublicationId: own.id };
  }

  let reviewAgainst: string | null = null;
  for (const candidateId of await findCandidateIds(db, mapped, titleKey)) {
    const candidate = await loadPublication(db, candidateId);
    if (!candidate) {
      continue;
    }
    const sources = await sourcesOf(db, candidateId);
    const decision = decideMerge({
      Incoming: {
        Doi: mapped.Publication.Doi,
        ArxivId: mapped.Publication.ArxivId,
        OpenAlexIds: mapped.OpenAlexIds ?? [],
      },
      Existing: {
        Doi: candidate.doi,
        ArxivId: candidate.arxiv_id,
        OpenAlexIds: sources.filter((s) => s.source === "openalex").map((s) => s.source_work_id),
      },
      IncomingTitle: mapped.Publication.Title,
      IncomingFirstAuthor: firstAuthor,
      ExistingTitle: candidate.title,
      ExistingFirstAuthor: await firstAuthorName(db, candidateId),
    });
    if (decision.Action === "merge") {
      return { Kind: "merge", PublicationId: candidateId };
    }
    if (decision.Action === "review" && reviewAgainst === null) {
      reviewAgainst = candidateId;
    }
  }
  return { Kind: "create", ReviewAgainst: reviewAgainst };
}

type DesiredAuthorship = AuthorshipRow;

function desiredAuthorships(mapped: MappedRecord): DesiredAuthorship[] {
  const byAuthor = new Map<string, DesiredAuthorship>();
  const authors = new Map(mapped.Authors.map((a) => [a.SourceAuthorId, a]));
  for (const authorship of mapped.Authorships) {
    const author = authors.get(authorship.SourceAuthorId);
    if (!author) {
      continue;
    }
    const id = authorId(author);
    if (!byAuthor.has(id)) {
      byAuthor.set(id, {
        author_id: id,
        position: authorship.Position,
        affiliations_json: JSON.stringify(authorship.Affiliations),
      });
    }
  }
  return [...byAuthor.values()].sort((a, b) => a.position - b.position);
}

function sameAuthorships(left: AuthorshipRow[], right: AuthorshipRow[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, index) =>
        row.author_id === right[index]?.author_id &&
        row.position === right[index]?.position &&
        row.affiliations_json === right[index]?.affiliations_json,
    )
  );
}

/**
 * Store one mapped source record (REQ-DATA-001, REQ-DATA-002, REQ-DATA-005,
 * REQ-DATA-007). Running it again with the same record changes nothing but the
 * source record's fetch time. All writes for the record go in one batch.
 */
export async function upsertMappedRecord(
  db: SqlDatabase,
  mapped: MappedRecord,
  deps: UpsertDeps,
): Promise<UpsertResult> {
  const now = deps.Now();
  const incoming = mapped.Publication;
  const erased = deps.SuppressedAuthors
    ? await deps.SuppressedAuthors(mapped.Authors.map(authorId))
    : new Set<string>();
  const firstAuthor = mapped.Authors[0];
  // An erased first author is not used for matching or kept in the title key.
  const incomingFirstAuthor =
    firstAuthor && !erased.has(authorId(firstAuthor)) ? firstAuthor.DisplayName : "";
  if (erased.size > 0) {
    const kept = mapped.Authors.filter((author) => !erased.has(authorId(author)));
    const keptSource = new Set(kept.map((author) => author.SourceAuthorId));
    mapped = {
      ...mapped,
      Authors: kept,
      Authorships: mapped.Authorships.filter((ship) => keptSource.has(ship.SourceAuthorId)),
    };
  }
  const incomingKey = incomingFirstAuthor
    ? titleAuthorReviewKey(incoming.Title, incomingFirstAuthor)
    : null;

  const target = await chooseTarget(db, mapped, incomingKey, incomingFirstAuthor);
  const existing =
    target.Kind === "create" ? null : await loadPublication(db, target.PublicationId);
  const refresh = target.Kind === "refresh";

  const title = mergedTitle(existing?.title ?? null, incoming.Title, refresh);
  const abstract = pick(existing?.abstract ?? null, incoming.Abstract, refresh);
  const publishedAt = pick(existing?.published_at ?? null, incoming.PublicationDate, refresh);
  const missing = missingPublicationFields({
    Title: title === PLACEHOLDER_TITLE ? null : title,
    Abstract: abstract,
    PublicationDate: publishedAt,
    Source: mapped.SourceRecord.Source,
    SourceIdentifier: mapped.SourceRecord.SourceId,
  });
  const row: Omit<PublicationRow, "id"> = {
    title,
    abstract,
    published_at: publishedAt,
    doi: pick(existing?.doi ?? null, incoming.Doi, refresh),
    arxiv_id: pick(existing?.arxiv_id ?? null, incoming.ArxivId, refresh),
    arxiv_version: Math.max(existing?.arxiv_version ?? 0, incoming.ArxivVersion ?? 0) || null,
    citation_count: Math.max(existing?.citation_count ?? 0, incoming.CitationCount),
    completeness: missing.length === 0 ? "complete" : "incomplete",
    retracted: existing?.retracted || incoming.RetractionFlag ? 1 : 0,
    topics_json: JSON.stringify(
      union(JSON.parse(existing?.topics_json ?? "[]") as string[], incoming.Topics),
    ),
    missing_fields_json: JSON.stringify(missing),
    language: pick(existing?.language ?? null, incoming.Language, refresh),
    has_storable_pdf: existing?.has_storable_pdf || incoming.HasStorablePdf ? 1 : 0,
    title_author_key: incomingKey ?? existing?.title_author_key ?? null,
  };

  const publicationId = existing?.id ?? `pub_${deps.NewId()}`;
  const statements: SqlStatement[] = [];
  const publicationChanged =
    !existing ||
    (Object.keys(row) as Array<keyof typeof row>).some((key) => row[key] !== existing[key]);

  if (!existing) {
    statements.push(
      db
        .prepare(
          `INSERT INTO publication (${PUBLICATION_COLUMNS}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          publicationId,
          row.title,
          row.abstract,
          row.published_at,
          row.doi,
          row.arxiv_id,
          row.arxiv_version,
          row.citation_count,
          row.completeness,
          row.retracted,
          row.topics_json,
          row.missing_fields_json,
          row.language,
          row.has_storable_pdf,
          row.title_author_key,
          now,
          now,
        ),
    );
  } else if (publicationChanged) {
    statements.push(
      db
        .prepare(
          "UPDATE publication SET title = ?, abstract = ?, published_at = ?, doi = ?, arxiv_id = ?, arxiv_version = ?, citation_count = ?, completeness = ?, retracted = ?, topics_json = ?, missing_fields_json = ?, language = ?, has_storable_pdf = ?, title_author_key = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          row.title,
          row.abstract,
          row.published_at,
          row.doi,
          row.arxiv_id,
          row.arxiv_version,
          row.citation_count,
          row.completeness,
          row.retracted,
          row.topics_json,
          row.missing_fields_json,
          row.language,
          row.has_storable_pdf,
          row.title_author_key,
          now,
          publicationId,
        ),
    );
  }

  const source = mapped.SourceRecord;
  const workId = sourceWorkId(source.Source, source.SourceId);
  const sourceWasKnown = target.Kind === "refresh";
  statements.push(
    db
      .prepare(
        "INSERT INTO source_record (id, publication_id, source, source_work_id, fetched_at, metadata_license, open_access_url, pdf_url, pdf_license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source, source_work_id) DO UPDATE SET fetched_at = excluded.fetched_at, metadata_license = excluded.metadata_license, open_access_url = excluded.open_access_url, pdf_url = excluded.pdf_url, pdf_license = excluded.pdf_license",
      )
      .bind(
        `src_${deps.NewId()}`,
        publicationId,
        source.Source,
        workId,
        source.FetchedAt,
        source.MetadataLicense,
        source.OpenAccessUrl,
        source.PdfUrl,
        source.PdfLicense,
      ),
  );

  // Author metadata: OpenAlex is richer, so an arXiv record never overwrites it.
  const otherSources = existing ? await sourcesOf(db, publicationId) : [];
  const keepOpenAlexAuthors =
    source.Source === "arxiv" && otherSources.some((s) => s.source === "openalex");
  let authorshipsChanged = false;
  if (!keepOpenAlexAuthors) {
    const desired = desiredAuthorships(mapped);
    const { results: current } = existing
      ? await db
          .prepare(
            "SELECT author_id, position, affiliations_json FROM authorship WHERE publication_id = ? ORDER BY position",
          )
          .bind(publicationId)
          .all<AuthorshipRow>()
      : { results: [] as AuthorshipRow[] };
    if (!sameAuthorships(current, desired)) {
      authorshipsChanged = true;
      const authors = new Map(mapped.Authors.map((a) => [authorId(a), a]));
      statements.push(
        db.prepare("DELETE FROM authorship WHERE publication_id = ?").bind(publicationId),
      );
      for (const authorship of desired) {
        const author = authors.get(authorship.author_id);
        const affiliations = JSON.parse(authorship.affiliations_json) as string[];
        statements.push(
          db
            .prepare(
              "INSERT INTO author (id, display_name, orcid) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING",
            )
            .bind(
              authorship.author_id,
              author?.DisplayName ?? "",
              author?.Orcid ? bareOrcid(author.Orcid) : null,
            ),
          db
            .prepare(
              "INSERT INTO authorship (publication_id, author_id, affiliation, position, affiliations_json) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(
              publicationId,
              authorship.author_id,
              affiliations[0] ?? null,
              authorship.position,
              authorship.affiliations_json,
            ),
        );
      }
    }
  }

  const reviewAgainst = target.Kind === "create" ? target.ReviewAgainst : null;
  if (reviewAgainst) {
    statements.push(
      db
        .prepare(
          "INSERT INTO title_author_review (id, review_key, incoming_source, incoming_source_work_id, existing_publication_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT (review_key) DO NOTHING",
        )
        .bind(
          `rev_${deps.NewId()}`,
          `${source.Source}:${workId}->${reviewAgainst}`,
          source.Source,
          workId,
          reviewAgainst,
          now,
          now,
        ),
    );
  }

  await db.batch(statements);

  const unchanged = sourceWasKnown && !publicationChanged && !authorshipsChanged;
  return {
    Outcome: !existing ? "created" : unchanged ? "unchanged" : "updated",
    PublicationId: publicationId,
    ReviewFlagged: reviewAgainst !== null,
  };
}
