import { QueueMessageEnvelopeSchema, stripArxivVersion } from "@roi/models";

import { parseArxivId } from "../collectors/arxiv/map-entry.js";
import { openAlexShortId } from "../collectors/openalex/map-work.js";
import { retractionCheckEnvelope, type PipelineDeps, type RunSource } from "../queue/deps.js";
import { claimMessage, completeStatement, markFailed } from "../queue/log.js";
import { addRunCountStatements } from "../recovery/redrive-repo.js";
import { type SqlStatement } from "../store/sql.js";
import { shiftDay } from "../triage/admission.js";

/** Stored arXiv IDs looked up per request; `id_list` URLs stay short (ADR 0112). */
export const ARXIV_IDS_PER_PAGE = 100;

/** D1 allows 100 bound values per query. */
const CHUNK = 50;

export type CheckStart = { Outcome: "started" | "already-ran" | "not-configured"; RunId: string };

export type CheckPageOutcome = "checked" | "duplicate" | "dead-lettered" | "skipped";

type RunRow = { id: string; day: string; status: string; started_at: string; counts_json: string };

/** The run of the weekly check on `day`: one per day, so a repeated trigger starts nothing. */
export function retractionRunId(day: string): string {
  return `rc_${day}`;
}

/**
 * The weekly retraction check (REQ-DATA-008 AC1, ADR 0061, ADR 0112), Monday 08:00 UTC. It looks
 * back `retraction.lookback_days` from the run day:
 *
 * - OpenAlex: retracted works of the window, with the ingestion scope and `is_retracted:true`.
 *   OpenAlex list endpoints leave retracted works out otherwise, so ingestion seldom sees one.
 * - arXiv: the stored preprints of the window by ID, 100 a page, read for withdrawal.
 *
 * Each page is a queue message on the page queue, so the arXiv interval holds and one invocation
 * stays short. A stored publication that a source marks is flagged; the next admission sweep
 * hides its candidates (REQ-DATA-008 AC2).
 */
export async function startRetractionCheck(deps: PipelineDeps, day: string): Promise<CheckStart> {
  const runId = retractionRunId(day);
  if (!deps.Retraction) {
    return { Outcome: "not-configured", RunId: runId };
  }
  const existing = await deps.Db.prepare("SELECT 1 AS found FROM processing_run WHERE id = ?")
    .bind(runId)
    .first<{ found: number }>();
  if (existing) {
    return { Outcome: "already-ran", RunId: runId };
  }
  await deps.Db.prepare(
    `INSERT INTO processing_run (id, kind, day, status, started_at)
     VALUES (?, 'retraction-check', ?, 'running', ?)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(runId, day, deps.Now())
    .run();
  await deps.Queue.sendBatch([
    { body: retractionCheckEnvelope(runId, "openalex", 1) },
    { body: retractionCheckEnvelope(runId, "arxiv", 0) },
  ]);
  deps.Log?.("retraction.check_started", { runId, day });
  return { Outcome: "started", RunId: runId };
}

/** Consumer of `retraction.check_page`: one page of one source. */
export async function handleRetractionCheckPage(
  deps: PipelineDeps,
  body: unknown,
): Promise<CheckPageOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }
  try {
    const { RunId: runId, Source: source, Page: page } = envelope.Ids;
    if (
      envelope.Type !== "retraction.check_page" ||
      runId === undefined ||
      page === undefined ||
      (source !== "openalex" && source !== "arxiv")
    ) {
      throw new Error("retraction.check_page needs RunId, Source, and Page");
    }
    const run = await deps.Db.prepare(
      "SELECT id, day, status, started_at, counts_json FROM processing_run WHERE id = ?",
    )
      .bind(runId)
      .first<RunRow>();
    if (!run || !deps.Retraction) {
      await deps.Db.batch([completeStatement(deps.Db, envelope.MessageId, deps.Now(), "no run")]);
      return "skipped";
    }
    const from = shiftDay(run.day, -deps.Retraction.LookbackDays);
    const checked =
      source === "openalex"
        ? await checkOpenAlexPage(deps, run, from, page)
        : await checkArxivPage(deps, run, from, page);
    const counts: Record<string, number> = { ...checked.Counts };
    if (!checked.HasMore) {
      counts[source === "openalex" ? "OpenAlexDone" : "ArxivDone"] = 1;
    }
    await deps.Db.batch([
      ...checked.Statements,
      ...addRunCountStatements(deps.Db, runId, counts),
      completeStatement(deps.Db, envelope.MessageId, deps.Now()),
    ]);
    if (checked.HasMore) {
      await deps.Queue.send(retractionCheckEnvelope(runId, source, page + 1), {
        delaySeconds: source === "arxiv" ? deps.Config.ArxivPageDelaySeconds : 0,
      });
    } else {
      await finishIfDone(deps, runId);
    }
    deps.Log?.("retraction.check_page", { runId, source, page, ...counts });
    return "checked";
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("retraction.check_failed", {
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

type CheckedPage = {
  Statements: SqlStatement[];
  Counts: Record<string, number>;
  HasMore: boolean;
};

async function checkOpenAlexPage(
  deps: PipelineDeps,
  run: RunRow,
  from: string,
  page: number,
): Promise<CheckedPage> {
  const fetched = await deps.Sources.FetchOpenAlexPage({
    FromDate: from,
    ToDate: run.day,
    SubfieldIds: deps.Config.OpenAlexScope.SubfieldIds,
    Retracted: true,
    Page: page,
  });
  const ids = fetched.Works.filter((work) => work.is_retracted === true).map((work) =>
    openAlexShortId(work.id),
  );
  const flagged = await flagStored(deps, "openalex", ids);
  return {
    Statements: flagged.Statements,
    Counts: { OpenAlexRetractedSeen: ids.length, OpenAlexFlagged: flagged.Count },
    HasMore: fetched.Works.length >= deps.Config.PageSize,
  };
}

async function checkArxivPage(
  deps: PipelineDeps,
  run: RunRow,
  from: string,
  page: number,
): Promise<CheckedPage> {
  // Every stored preprint of the window, flagged or not, so the offsets stay stable while
  // earlier pages flag rows; created before the check, so new rows do not shift them.
  const { results } = await deps.Db.prepare(
    `SELECT sr.source_work_id FROM source_record sr JOIN publication p ON p.id = sr.publication_id
     WHERE sr.source = 'arxiv' AND p.published_at >= ? AND p.created_at < ?
     ORDER BY sr.id LIMIT ? OFFSET ?`,
  )
    .bind(from, run.started_at, ARXIV_IDS_PER_PAGE, page * ARXIV_IDS_PER_PAGE)
    .all<{ source_work_id: string }>();
  const stored = results.map((row) => row.source_work_id);
  const entries = await deps.Sources.FetchArxivByIds(stored);
  const withdrawn = entries
    .filter((entry) => entry.withdrawn === true)
    .map((entry) => stripArxivVersion(parseArxivId(entry.id)));
  const flagged = await flagStored(deps, "arxiv", withdrawn);
  return {
    Statements: flagged.Statements,
    Counts: { ArxivChecked: stored.length, ArxivFlagged: flagged.Count },
    HasMore: stored.length === ARXIV_IDS_PER_PAGE,
  };
}

/** Flags the stored, not yet flagged publications with these source IDs. */
async function flagStored(
  deps: PipelineDeps,
  source: RunSource,
  sourceIds: readonly string[],
): Promise<{ Statements: SqlStatement[]; Count: number }> {
  const statements: SqlStatement[] = [];
  let count = 0;
  const now = deps.Now();
  for (let start = 0; start < sourceIds.length; start += CHUNK) {
    const slice = sourceIds.slice(start, start + CHUNK).map((id) => id.toLowerCase());
    const marks = slice.map(() => "?").join(", ");
    const matches = `SELECT publication_id FROM source_record
      WHERE source = ? AND lower(source_work_id) IN (${marks})`;
    const found = await deps.Db.prepare(
      `SELECT COUNT(*) AS n FROM publication WHERE retracted = 0 AND id IN (${matches})`,
    )
      .bind(source, ...slice)
      .first<{ n: number }>();
    count += found?.n ?? 0;
    statements.push(
      deps.Db.prepare(
        `UPDATE publication SET retracted = 1, updated_at = ? WHERE retracted = 0 AND id IN (${matches})`,
      ).bind(now, source, ...slice),
    );
  }
  return { Statements: statements, Count: count };
}

/** Marks the run succeeded once both sources have reached their last page. */
async function finishIfDone(deps: PipelineDeps, runId: string): Promise<void> {
  await deps.Db.prepare(
    `UPDATE processing_run SET status = 'succeeded', ended_at = ?
     WHERE id = ? AND status = 'running'
       AND json_extract(counts_json, '$.OpenAlexDone') = 1
       AND json_extract(counts_json, '$.ArxivDone') = 1`,
  )
    .bind(deps.Now(), runId)
    .run();
}
