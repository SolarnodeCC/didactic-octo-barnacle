import { admitWithinDailyLimit } from "@roi/models";

import { type PipelineDeps } from "../queue/deps.js";
import { addRunCountStatements } from "../recovery/redrive-repo.js";
import { normalizePdfLicense } from "../normalize/license.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

/** D1 allows 100 bound values per query. */
const CHUNK = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdmissionCounts = {
  /** Admitted to extraction this run (REQ-PROC-005 AC2). */
  Admitted: number;
  /** Ready, but past the daily limit: `daily-limit`, considered again tomorrow. */
  DeferredDailyLimit: number;
  /** Ranked, but its full text may still come: it keeps its rank and waits (ADR 0065). */
  NotReady: number;
  /** Admitted on the abstract because the full-text wait ran out (REQ-PROC-011 AC5). */
  AdmittedOnAbstractAfterWait: number;
  /** Left the pool after `triage.admission_pool_days`; `daily-limit` is final. */
  ExpiredFromPool: number;
  /** Dated after the run day, so left out of today's ranking (ADR 0068). */
  FutureDated: number;
  /** Extractions re-driven this day, taken from the day's limit (REQ-PROC-010 AC3). */
  RedrivenExtractionsCounted: number;
};

export type AdmissionOutcome =
  | { Outcome: "admitted"; Day: string; Counts: AdmissionCounts }
  | { Outcome: "already-ran" | "budget-stopped" | "not-configured"; Day: string };

type PoolRow = {
  publication_id: string;
  score: number;
  created_at: string;
  published_at: string | null;
};

/**
 * The daily admission (ADR 0055, ADR 0065; REQ-PROC-005 AC2, REQ-PROC-008 AC4, REQ-PROC-011).
 * It ranks every passing publication still in the pool, by triage score, then newest
 * publication date, then publication ID, and walks the ranking in order:
 *
 * - a publication that is ready is admitted while the day's limit lasts, and otherwise gets
 *   `daily-limit` and stays in the pool for tomorrow;
 * - a publication that is not ready keeps its place, uses none of the limit, and is
 *   considered again tomorrow.
 *
 * Ready means its document state is final (text stored or failed, no PDF with a license that
 * allows storage, or the PDF message finished without a document), or
 * `extraction.full_text_wait_hours` have passed since its triage decision. A decision older
 * than `triage.admission_pool_days` leaves the pool with `daily-limit` as its final reason.
 *
 * One run per UTC day: the `admission_day` row is written last, so a repeated trigger, or one
 * after a run that stopped halfway, admits nobody twice. With the day's budget used up, it
 * admits nobody (REQ-NFR-005 AC2). `queueAdmittedExtractions` then sends the extraction
 * messages, after this batch has committed.
 */
export async function admitDay(deps: PipelineDeps, day: string): Promise<AdmissionOutcome> {
  const triage = deps.Triage;
  if (!triage) {
    deps.Log?.("admission.not_configured", { day });
    return { Outcome: "not-configured", Day: day };
  }
  const db = deps.Db;
  const ran = await db
    .prepare("SELECT 1 AS found FROM admission_day WHERE day = ?")
    .bind(day)
    .first<{ found: number }>();
  if (ran) {
    return { Outcome: "already-ran", Day: day };
  }
  if (!(await triage.Call.Usage.budgetAllows(day))) {
    deps.Log?.("admission.budget_stopped", { day });
    return { Outcome: "budget-stopped", Day: day };
  }

  const now = deps.Now();
  const { DailyLimit, PoolDays, FullTextWaitHours } = triage.Admission;
  const poolStart = `${shiftDay(day, -PoolDays)}T00:00:00.000Z`;
  const counts: AdmissionCounts = {
    Admitted: 0,
    DeferredDailyLimit: 0,
    NotReady: 0,
    AdmittedOnAbstractAfterWait: 0,
    ExpiredFromPool: 0,
    FutureDated: 0,
    RedrivenExtractionsCounted: 0,
  };

  // Admissions already made this day count against its limit, and so do the extractions
  // re-driven this day (REQ-PROC-010 AC3, ADR 0063).
  const already = await db
    .prepare("SELECT COUNT(*) AS n FROM triage_decision WHERE admitted_on = ?")
    .bind(day)
    .first<{ n: number }>();
  const redriven = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM redrive WHERE step = 'extraction' AND substr(last_attempt_at, 1, 10) = ?",
    )
    .bind(day)
    .first<{ n: number }>();
  counts.RedrivenExtractionsCounted = redriven?.n ?? 0;
  let room = Math.max(0, DailyLimit - (already?.n ?? 0) - counts.RedrivenExtractionsCounted);

  const { results: pool } = await db
    .prepare(
      `SELECT td.publication_id, td.score, td.created_at, p.published_at
       FROM triage_decision td JOIN publication p ON p.id = td.publication_id
       WHERE td.status = 'awaiting-admission' AND td.created_at >= ? AND p.retracted = 0`,
    )
    .bind(poolStart)
    .all<PoolRow>();

  const current = pool.filter((row) => {
    const future = row.published_at !== null && row.published_at > day;
    if (future) {
      counts.FutureDated += 1;
    }
    return !future;
  });
  const ranked = admitWithinDailyLimit(
    current.map((row) => ({
      PublicationId: row.publication_id,
      PublishedAt: row.published_at ?? "",
      TriageScore: row.score,
      CreatedAt: row.created_at,
    })),
    Number.MAX_SAFE_INTEGER,
  ).Admitted;

  const states = await documentStates(
    db,
    ranked.map((row) => row.PublicationId),
  );
  const admitted: string[] = [];
  const deferred: string[] = [];
  const nowMs = Date.parse(now);
  for (const row of ranked) {
    const state = states.get(row.PublicationId) ?? NO_DOCUMENT_STATE;
    const waited = nowMs - Date.parse(row.CreatedAt) >= FullTextWaitHours * 60 * 60 * 1000;
    const final = isFinal(state);
    if (!final && !waited) {
      counts.NotReady += 1;
      continue;
    }
    if (room > 0) {
      room -= 1;
      admitted.push(row.PublicationId);
      if (!final) {
        // Ready only because the wait ran out: extraction reads the abstract.
        counts.AdmittedOnAbstractAfterWait += 1;
      }
    } else {
      deferred.push(row.PublicationId);
    }
  }
  counts.Admitted = admitted.length;
  counts.DeferredDailyLimit = deferred.length;

  const expired = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM triage_decision WHERE status = 'awaiting-admission' AND created_at < ?",
    )
    .bind(poolStart)
    .first<{ n: number }>();
  counts.ExpiredFromPool = expired?.n ?? 0;

  const statements: SqlStatement[] = [
    ...chunked(admitted, (ids, marks) =>
      db
        .prepare(
          `UPDATE triage_decision SET status = 'decided', accepted = 1, reason = 'accepted',
             admitted_on = ?, updated_at = ?
           WHERE status = 'awaiting-admission' AND publication_id IN (${marks})`,
        )
        .bind(day, now, ...ids),
    ),
    ...chunked(deferred, (ids, marks) =>
      db
        .prepare(
          `UPDATE triage_decision SET reason = 'daily-limit', updated_at = ?
           WHERE status = 'awaiting-admission' AND publication_id IN (${marks})`,
        )
        .bind(now, ...ids),
    ),
    db
      .prepare(
        `UPDATE triage_decision SET status = 'decided', reason = 'daily-limit', updated_at = ?
         WHERE status = 'awaiting-admission' AND created_at < ?`,
      )
      .bind(now, poolStart),
  ];
  const runId = await dailyRunId(db, day, now, deps.NewId);
  statements.push(
    ...addRunCountStatements(db, runId, counts),
    db
      .prepare(
        "INSERT INTO admission_day (day, daily_limit, admitted, deferred, ran_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(day, DailyLimit, counts.Admitted, counts.DeferredDailyLimit, now),
  );
  await db.batch(statements);
  deps.Log?.("admission.done", { day, ...counts });
  return { Outcome: "admitted", Day: day, Counts: counts };
}

type DocumentState = {
  /** `document.status`, or null without a stored document. */
  DocumentStatus: string | null;
  /** A source record has a PDF URL with a license that allows storage (REQ-DATA-010). */
  HasStorablePdf: boolean;
  /** The `document.ingest` message has finished: completed, failed after its retries, or dead-lettered. */
  PdfMessageFinished: boolean;
};

const NO_DOCUMENT_STATE: DocumentState = {
  DocumentStatus: null,
  HasStorablePdf: false,
  PdfMessageFinished: false,
};

/** A final document state: nothing more will come for this publication's text (ADR 0065). */
function isFinal(state: DocumentState): boolean {
  if (state.DocumentStatus === "text-extracted" || state.DocumentStatus === "text-failed") {
    return true;
  }
  if (!state.HasStorablePdf) {
    return true;
  }
  return state.DocumentStatus === null && state.PdfMessageFinished;
}

async function documentStates(
  db: SqlDatabase,
  publicationIds: string[],
): Promise<Map<string, DocumentState>> {
  const states = new Map<string, DocumentState>(
    publicationIds.map((id) => [id, { ...NO_DOCUMENT_STATE }]),
  );
  for (let start = 0; start < publicationIds.length; start += CHUNK) {
    const ids = publicationIds.slice(start, start + CHUNK);
    const marks = ids.map(() => "?").join(", ");
    const documents = await db
      .prepare(`SELECT publication_id, status FROM document WHERE publication_id IN (${marks})`)
      .bind(...ids)
      .all<{ publication_id: string; status: string }>();
    for (const row of documents.results) {
      const state = states.get(row.publication_id);
      if (state) {
        state.DocumentStatus = row.status;
      }
    }
    const sources = await db
      .prepare(
        `SELECT publication_id, pdf_license FROM source_record
         WHERE pdf_url IS NOT NULL AND publication_id IN (${marks})`,
      )
      .bind(...ids)
      .all<{ publication_id: string; pdf_license: string | null }>();
    for (const row of sources.results) {
      const state = states.get(row.publication_id);
      if (state && normalizePdfLicense(row.pdf_license)) {
        state.HasStorablePdf = true;
      }
    }
    const messages = await db
      .prepare(
        `SELECT message_id, status FROM queue_message_log
         WHERE status IN ('completed', 'failed', 'dead-lettered') AND message_id IN (${marks})`,
      )
      .bind(...ids.map((id) => `document:${id}`))
      .all<{ message_id: string; status: string }>();
    for (const row of messages.results) {
      const state = states.get(row.message_id.replace(/^document:/, ""));
      if (state) {
        state.PdfMessageFinished = true;
      }
    }
  }
  return states;
}

function chunked(
  ids: string[],
  make: (ids: string[], marks: string) => SqlStatement,
): SqlStatement[] {
  const statements: SqlStatement[] = [];
  for (let start = 0; start < ids.length; start += CHUNK) {
    const slice = ids.slice(start, start + CHUNK);
    statements.push(make(slice, slice.map(() => "?").join(", ")));
  }
  return statements;
}

/** The ISO date `days` days after `day` (negative for before). */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
