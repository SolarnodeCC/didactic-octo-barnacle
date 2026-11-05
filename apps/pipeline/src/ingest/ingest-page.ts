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
import { upsertMappedRecord, type MappedRecord } from "../store/publication-repo.js";
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

async function ingestItem(
  deps: IngestDeps,
  result: IngestResult,
  sourceId: string | null | undefined,
  map: () => MappedRecord,
): Promise<void> {
  result.Counts.Fetched += 1;
  try {
    const mapped = map();
    const outcome = await upsertMappedRecord(deps.Db, mapped, deps);
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
    // One bad item never stops the page (REQ-DATA-001 AC3).
    result.Counts.Failed += 1;
    result.Failures.push({
      // A malformed item can lack an ID; JSON would drop `undefined`, so keep it as null.
      SourceId: sourceId ?? null,
      Reason: error instanceof Error ? error.message : String(error),
    });
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
): Promise<IngestResult> {
  const result = emptyResult();
  const fetchedAt = deps.Now();
  for (const work of works) {
    const published = work.publication_date ?? null;
    if (
      !isOpenAlexTopicsInScope(openAlexTopicNames(work), topicNames) ||
      (earliestDate !== undefined && published !== null && published < earliestDate)
    ) {
      result.Counts.Fetched += 1;
      result.Counts.Skipped += 1;
      continue;
    }
    await ingestItem(deps, result, work.id, () => mapOpenAlexWork(work, fetchedAt));
  }
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
    await ingestItem(deps, result, entry.id, () => mapArxivEntry(entry, fetchedAt));
  }
  return result;
}
