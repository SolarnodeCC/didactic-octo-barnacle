import { type IngestionRunCounts, type IngestionRunFailure } from "@roi/models";

import { mapArxivEntry } from "../collectors/arxiv/map-entry.js";
import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { mapOpenAlexWork } from "../collectors/openalex/map-work.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { isArxivCategoryInScope, PILOT_ARXIV_CATEGORIES } from "../normalize/scope.js";
import { upsertMappedRecord, type MappedRecord } from "../store/publication-repo.js";
import { type SqlDatabase } from "../store/sql.js";

export type IngestDeps = {
  Db: SqlDatabase;
  Now: () => string;
  NewId: () => string;
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
    // One bad item never stops the page (REQ-DATA-001 AC3).
    result.Counts.Failed += 1;
    result.Failures.push({
      // A malformed item can lack an ID; JSON would drop `undefined`, so keep it as null.
      SourceId: sourceId ?? null,
      Reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Store a page of OpenAlex works (REQ-DATA-001). */
export async function ingestOpenAlexWorks(
  deps: IngestDeps,
  works: OpenAlexWork[],
): Promise<IngestResult> {
  const result = emptyResult();
  const fetchedAt = deps.Now();
  for (const work of works) {
    await ingestItem(deps, result, work.id, () => mapOpenAlexWork(work, fetchedAt));
  }
  return result;
}

/** Store a page of arXiv entries; out-of-scope categories are skipped (REQ-DATA-002 AC1). */
export async function ingestArxivEntries(
  deps: IngestDeps,
  entries: ArxivEntry[],
  categories: readonly string[] = PILOT_ARXIV_CATEGORIES,
): Promise<IngestResult> {
  const result = emptyResult();
  const fetchedAt = deps.Now();
  for (const entry of entries) {
    if (!isArxivCategoryInScope([entry.primaryCategory, ...entry.categories], categories)) {
      result.Counts.Fetched += 1;
      result.Counts.Skipped += 1;
      continue;
    }
    await ingestItem(deps, result, entry.id, () => mapArxivEntry(entry, fetchedAt));
  }
  return result;
}
