import { QueueMessageEnvelopeSchema, type IngestionRunFailure } from "@roi/models";

import { claimMessage, completeStatement, markFailed } from "./log.js";
import { documentIngestEnvelope, fetchPageEnvelope, type PipelineDeps } from "./deps.js";
import {
  ingestArxivEntries,
  ingestOpenAlexWorks,
  type IngestResult,
} from "../ingest/ingest-page.js";
import { SCOPE_ARXIV_CATEGORIES } from "../normalize/scope.js";
import { earliestWindowStart } from "../schedule/window.js";
import { pendingDocumentIds } from "../store/document-repo.js";
import { finishRunStatement, getRun, recordPageStatement, type RunRow } from "../store/run-repo.js";

export type PageOutcome = "processed" | "duplicate" | "dead-lettered" | "skipped";

type FetchedPage = {
  Result: IngestResult;
  HasMore: boolean;
  NextCursor: string | null;
};

function max(left: string, right: string): string {
  return left >= right ? left : right;
}

async function fetchAndIngest(deps: PipelineDeps, run: RunRow): Promise<FetchedPage> {
  const guard = deps.AuthorGuard;
  const ingestDeps = {
    Db: deps.Db,
    Now: deps.Now,
    NewId: deps.NewId,
    ...(guard ? { SuppressedAuthors: (ids: string[]) => guard.Suppressed(ids) } : {}),
  };
  const runDay = run.StartedAt.slice(0, 10);
  // A run that continues an earlier one keeps that run's window so its saved cursor stays
  // valid, but it never stores anything older than `MaxAgeDays` before its own day.
  const requestFrom = run.WindowFrom ?? runDay;
  const limit = earliestWindowStart(runDay, deps.Config.MaxAgeDays);
  const from = max(requestFrom, limit);

  if (run.Source === "openalex") {
    const fetched = await deps.Sources.FetchOpenAlexPage({
      FromDate: requestFrom,
      SubfieldIds: deps.Config.OpenAlexScope.SubfieldIds,
      ...(run.PageCursor ? { Cursor: run.PageCursor } : {}),
    });
    return {
      Result: await ingestOpenAlexWorks(
        ingestDeps,
        fetched.Works,
        deps.Config.OpenAlexScope.TopicNames,
        limit,
      ),
      HasMore: fetched.NextCursor !== null && fetched.Works.length > 0,
      NextCursor: fetched.NextCursor,
    };
  }

  // The offset of this page: kept in the run row, so a run that continues an earlier
  // one starts where that one stopped.
  const pageSize = deps.Config.PageSize;
  const start = Number(run.PageCursor ?? 0);
  if (!Number.isInteger(start) || start < 0) {
    throw new Error("the saved arXiv page offset is not a number");
  }
  // Only preprints whose first version is within the limit; a new version of a recent one
  // still comes back, because the feed is sorted by the last update.
  const fetched = await deps.Sources.FetchArxivPage({
    Start: start,
    MaxResults: pageSize,
    SubmittedFrom: limit,
    SubmittedTo: runDay,
  });
  // The feed is newest first: an entry updated before the window ends the run.
  const inWindow = fetched.Entries.filter((entry) => entry.updated.slice(0, 10) >= from);
  const reachedOlder = inWindow.length < fetched.Entries.length;
  return {
    Result: await ingestArxivEntries(ingestDeps, inWindow, SCOPE_ARXIV_CATEGORIES, limit),
    HasMore: fetched.Returned >= pageSize && !reachedOlder,
    NextCursor: String(start + pageSize),
  };
}

async function processPage(
  deps: PipelineDeps,
  runId: string,
  page: number,
  messageId: string,
): Promise<PageOutcome> {
  const now = deps.Now();
  const run = await getRun(deps.Db, runId);
  if (!run || run.Status !== "running") {
    // The run was closed (failed or timed out): nothing left to do for this page.
    await deps.Db.batch([completeStatement(deps.Db, messageId, now)]);
    return "skipped";
  }

  const fetched = await fetchAndIngest(deps, run);
  const nextPage = page + 1;
  const continuing = fetched.HasMore && nextPage < deps.Config.MaxPagesPerRun;
  const failures: IngestionRunFailure[] = [...fetched.Result.Failures];
  if (fetched.HasMore && !continuing) {
    failures.push({
      SourceId: null,
      Reason: `page cap of ${deps.Config.MaxPagesPerRun} reached; the next run covers the rest`,
    });
  }

  // Publications with a storable PDF get a document message; the PDF itself is fetched
  // by its own consumer. Sent before the commit, like the next page: a repeat is deduplicated.
  for (const publicationId of await pendingDocumentIds(deps.Db, fetched.Result.PdfCandidates)) {
    await deps.Queue.send(documentIngestEnvelope(publicationId));
  }

  const statements = [
    recordPageStatement(deps.Db, run, {
      Counts: fetched.Result.Counts,
      Failures: failures,
      // At the page cap the cursor stays in the row: the next run continues there.
      NextCursor: fetched.HasMore ? fetched.NextCursor : null,
    }),
  ];

  if (continuing) {
    // Enqueue before committing: a crash in between repeats this page, which is
    // idempotent, and the next page is deduplicated by its message ID.
    await deps.Queue.send(fetchPageEnvelope(run.Id, run.Source, nextPage), {
      delaySeconds: run.Source === "arxiv" ? deps.Config.ArxivPageDelaySeconds : 0,
    });
  } else {
    // Items that failed, or pages left behind by the cap, leave data missing. A
    // dead-letter entry from an earlier delivery stays in the history but does not.
    const hadProblems =
      run.Counts.Failed + fetched.Result.Counts.Failed > 0 || (fetched.HasMore && !continuing);
    statements.push(
      finishRunStatement(deps.Db, {
        Id: run.Id,
        Status: hadProblems ? "partial" : "succeeded",
        EndedAt: now,
        WindowEnd: run.WindowEnd ?? run.StartedAt.slice(0, 10),
      }),
    );
  }

  statements.push(completeStatement(deps.Db, messageId, now));
  await deps.Db.batch(statements);
  deps.Log?.("page.processed", {
    runId: run.Id,
    source: run.Source,
    page,
    ...fetched.Result.Counts,
    continuing,
  });
  return "processed";
}

/**
 * Consumer of `source.fetch_page` (REQ-DATA-009, REQ-DATA-011). A message is claimed
 * first, so a repeated delivery is skipped; the page, its counts, and the message
 * state are written in one batch. A thrown error makes the queue retry the message
 * and, after the last retry, move it to the dead-letter queue.
 */
export async function handleFetchPage(deps: PipelineDeps, body: unknown): Promise<PageOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    deps.Log?.("message.skipped", {
      messageId: envelope.MessageId,
      runId: envelope.Ids.RunId,
      reason: claim,
    });
    return claim;
  }

  const { RunId, Page } = envelope.Ids;
  try {
    if (RunId === undefined || Page === undefined) {
      throw new Error("source.fetch_page needs RunId and Page");
    }
    return await processPage(deps, RunId, Page, envelope.MessageId);
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("page.failed", {
      runId: RunId,
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
