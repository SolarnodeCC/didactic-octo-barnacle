import { type IngestionRunCounts, type IngestionRunFailure } from "@roi/models";

import { mapArxivEntry } from "../collectors/arxiv/map-entry.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { mapOpenAlexWork } from "../collectors/openalex/map-work.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import {
  isArxivCategoryInScope,
  isOpenAlexTopicsInScope,
  SCOPE_ARXIV_CATEGORIES,
} from "../normalize/scope.js";
import { ErasureConfigError } from "../privacy/author-key.js";
import { authorId, upsertMappedRecord, type MappedRecord } from "../store/publication-repo.js";
import { type SqlDatabase } from "../store/sql.js";

export type IngestDeps = {
  Db: SqlDatabase;
  Now: () => string;
  NewId: () => string;
  SuppressedAuthors?: (authorIds: string[]) => Promise<Set<string>>;
};

export type IngestResult = {
  Counts: IngestionRunCounts;
  /** Items that failed; the run report (REQ-NFR-008) and the next run pick them up. */
  Failures: IngestionRunFailure[];
  /** Publications whose source record has a PDF URL and a license that allows storage. */
  PdfCandidates: string[];
};

function emptyResult(): IngestResult {
  return {
    Counts: { Fetched: 0, Created: 0, Updated: 0, Skipped: 0, Failed: 0, DeadLettered: 0 },
    Failures: [],
    PdfCandidates: [],
  };
}

/** An item of a page after mapping: the record, or the error that mapping it raised. */
type PreparedItem = { SourceId: string | null | undefined; Map: () => MappedRecord };
type MappedItem =
  | { SourceId: string | null | undefined; Mapped: MappedRecord }
  | { SourceId: string | null | undefined; Error: unknown };

function recordFailure(result: IngestResult, sourceId: string | null | undefined, error: unknown) {
  // One bad item never stops the page (REQ-DATA-001 AC3).
  result.Counts.Failed += 1;
  result.Failures.push({
    // A malformed item can lack an ID; JSON would drop `undefined`, so keep it as null.
    SourceId: sourceId ?? null,
    Reason: error instanceof Error ? error.message : String(error),
  });
}

/**
 * The erasure list is checked once for every author on the page instead of once per
 * record (REQ-NFR-016, REQ-NFR-010); each record then reads its answer from that set.
 * A missing erasure key still stops the page (`ErasureConfigError`).
 */
async function withPageErasures(deps: IngestDeps, items: MappedItem[]): Promise<IngestDeps> {
  if (!deps.SuppressedAuthors) {
    return deps;
  }
  const ids = items.flatMap((item) => ("Mapped" in item ? item.Mapped.Authors.map(authorId) : []));
  const erased = ids.length > 0 ? await deps.SuppressedAuthors(ids) : new Set<string>();
  return {
    ...deps,
    SuppressedAuthors: (asked) => Promise.resolve(new Set(asked.filter((id) => erased.has(id)))),
  };
}

async function ingestItems(
  deps: IngestDeps,
  result: IngestResult,
  prepared: PreparedItem[],
): Promise<void> {
  const items: MappedItem[] = prepared.map((item) => {
    try {
      return { SourceId: item.SourceId, Mapped: item.Map() };
    } catch (error) {
      return { SourceId: item.SourceId, Error: error };
    }
  });
  const pageDeps = await withPageErasures(deps, items);
  for (const item of items) {
    result.Counts.Fetched += 1;
    if ("Error" in item) {
      recordFailure(result, item.SourceId, item.Error);
      continue;
    }
    try {
      const mapped = item.Mapped;
      const outcome = await upsertMappedRecord(pageDeps.Db, mapped, pageDeps);
      if (mapped.Publication.HasStorablePdf) {
        result.PdfCandidates.push(outcome.PublicationId);
      }
      if (outcome.Outcome === "created") {
        result.Counts.Created += 1;
      } else if (outcome.Outcome === "updated") {
        result.Counts.Updated += 1;
      } else {
        result.Counts.Skipped += 1;
      }
    } catch (error) {
      // Without the erasure key an erased author could be stored again: stop the page.
      if (error instanceof ErasureConfigError) {
        throw error;
      }
      recordFailure(result, item.SourceId, error);
    }
  }
}

/**
 * Names of the work's primary topic, its field, and its subfield (ADR 0041). OpenAlex lists
 * the primary topic first in `topics`, so that is the fallback when `primary_topic` is absent.
 */
function openAlexTopicNames(work: OpenAlexWork): string[] {
  const topic = work.primary_topic ?? work.topics?.[0];
  if (!topic) {
    return [];
  }
  return [topic.display_name, topic.field?.display_name, topic.subfield?.display_name].filter(
    (value): value is string => Boolean(value),
  );
}

/**
 * Store a page of OpenAlex works (REQ-DATA-001). A work whose primary topic, field, and
 * subfield match none of `topicNames` is skipped and never stored, whatever the server-side
 * filter did.
 */
export async function ingestOpenAlexWorks(
  deps: IngestDeps,
  works: OpenAlexWork[],
  topicNames: readonly string[],
  /** Oldest publication date to store (YYYY-MM-DD); an older work is skipped. */
  earliestDate?: string,
  /**
   * Work types and abstract rule of ADR 0048: a work outside them is skipped, whatever the
   * server-side filter did. Omitted, no work is skipped for its type or abstract.
   * `LatestDate` (YYYY-MM-DD) is the day of the run: a work dated after it is skipped
   * (REQ-DATA-009 AC7, ADR 0068).
   */
  kind: { WorkTypes?: readonly string[]; RequireAbstract?: boolean; LatestDate?: string } = {},
): Promise<IngestResult> {
  const result = emptyResult();
  const fetchedAt = deps.Now();
  const prepared: PreparedItem[] = [];
  const types = kind.WorkTypes && kind.WorkTypes.length > 0 ? new Set(kind.WorkTypes) : null;
  for (const work of works) {
    const published = work.publication_date ?? null;
    const hasAbstract = Object.keys(work.abstract_inverted_index ?? {}).length > 0;
    if (
      !isOpenAlexTopicsInScope(openAlexTopicNames(work), topicNames) ||
      (types !== null && !types.has(work.type ?? "")) ||
      (kind.RequireAbstract === true && !hasAbstract) ||
      (earliestDate !== undefined && published !== null && published < earliestDate) ||
      (kind.LatestDate !== undefined && published !== null && published > kind.LatestDate)
    ) {
      result.Counts.Fetched += 1;
      result.Counts.Skipped += 1;
      continue;
    }
    prepared.push({ SourceId: work.id, Map: () => mapOpenAlexWork(work, fetchedAt) });
  }
  await ingestItems(deps, result, prepared);
  return result;
}

/**
 * Store a page of arXiv entries; out-of-scope categories are skipped (REQ-DATA-002 AC1).
 * An entry whose first version was published before `earliestDate` (YYYY-MM-DD) is skipped
 * too, also when it has a new version (REQ-DATA-009 AC6).
 */
export async function ingestArxivEntries(
  deps: IngestDeps,
  entries: ArxivEntry[],
  categories: readonly string[] = SCOPE_ARXIV_CATEGORIES,
  earliestDate?: string,
): Promise<IngestResult> {
  const result = emptyResult();
  const fetchedAt = deps.Now();
  const prepared: PreparedItem[] = [];
  for (const entry of entries) {
    const published = entry.published.slice(0, 10);
    if (
      !isArxivCategoryInScope([entry.primaryCategory, ...entry.categories], categories) ||
      (earliestDate !== undefined && published !== "" && published < earliestDate)
    ) {
      result.Counts.Fetched += 1;
      result.Counts.Skipped += 1;
      continue;
    }
    prepared.push({ SourceId: entry.id, Map: () => mapArxivEntry(entry, fetchedAt) });
  }
  await ingestItems(deps, result, prepared);
  return result;
}
