import {
  CANDIDATE_QUOTE_FIELDS,
  agreementRate,
  findQuoteSpan,
  quoteOccurs,
  type AbstractHighlight,
  type CandidateCorrection,
  type CurrentVerdict,
  type InputMode,
  type RecordVerdict,
  type ReviewCandidate,
  type ReviewDetailResponse,
  type ReviewExportLine,
  type ReviewListItem,
  type ReviewListQuery,
  type ReviewListResponse,
  type ReviewStatsRow,
  type ReviewTag,
  type ReviewTargetKind,
  type ReviewVerdict,
  type TriageReason,
  type TriageSignals,
} from "@roi/models";

import { type SqlDatabase, type SqlValue } from "./sql.js";

/**
 * Reads of the pipeline's output and writes of review verdicts (ADR 0116). The tool writes only
 * `output_review`; pipeline tables are read-only here.
 */

/**
 * The current verdict per target: the newest row that is not withdrawn, by insertion order
 * (REQ-REV-003 AC2, REQ-REV-008).
 */
export const CURRENT_REVIEW = `
  latest AS (
    SELECT MAX(rowid) AS rid FROM output_review
    WHERE withdrawn_at IS NULL
    GROUP BY target_kind, target_id
  ),
  current_review AS (
    SELECT r.* FROM output_review r JOIN latest ON r.rowid = latest.rid
  )`;

/** Visible candidates; retracted ones are hidden from review as from every other view. */
export const VISIBLE_CANDIDATE = "c.hidden_reason IS NULL";

type ListRow = {
  PublicationId: string;
  Title: string;
  PublishedAt: string | null;
  TriageId: string;
  TriageAccepted: number;
  TriageReason: TriageReason | null;
  TriagePromptVersion: string | null;
  DecidedAt: string;
  CandidateCount: number;
  ReviewedTargets: number;
};

function encodeCursor(decidedAt: string, triageId: string): string {
  return btoa(JSON.stringify([decidedAt, triageId]))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

/** The position after which the next page starts, or null for a malformed cursor. */
export function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value: unknown = JSON.parse(atob(cursor.replace(/-/gu, "+").replace(/_/gu, "/")));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Fall through: a cursor that does not decode is refused by the caller.
  }
  return null;
}

export class CursorError extends Error {}

/** The review list, newest triage decision first (REQ-REV-001). */
export async function listPublications(
  db: SqlDatabase,
  query: ReviewListQuery,
): Promise<ReviewListResponse> {
  const inner: string[] = [];
  const innerValues: SqlValue[] = [];
  if (query.Accepted) {
    inner.push("t.accepted = ?");
    innerValues.push(query.Accepted === "yes" ? 1 : 0);
  }
  if (query.Reason) {
    inner.push("t.reason = ?");
    innerValues.push(query.Reason);
  }
  if (query.PromptVersion) {
    inner.push(
      "(t.prompt_version = ? OR EXISTS (SELECT 1 FROM extraction_result e WHERE e.publication_id = p.id AND e.prompt_version = ?))",
    );
    innerValues.push(query.PromptVersion, query.PromptVersion);
  }
  if (query.Day) {
    inner.push("substr(t.created_at, 1, 10) = ?");
    innerValues.push(query.Day);
  }

  const outer: string[] = [];
  const outerValues: SqlValue[] = [];
  if (query.Reviewed === "yes") {
    outer.push("ReviewedTargets >= CandidateCount + 1");
  } else if (query.Reviewed === "no") {
    outer.push("ReviewedTargets < CandidateCount + 1");
  }
  if (query.Cursor) {
    const position = decodeCursor(query.Cursor);
    if (!position) {
      throw new CursorError("the cursor is not valid");
    }
    outer.push("(DecidedAt < ? OR (DecidedAt = ? AND TriageId < ?))");
    outerValues.push(position[0], position[0], position[1]);
  }

  const sql = `
    WITH ${CURRENT_REVIEW},
    rows AS (
      SELECT
        p.id AS PublicationId,
        p.title AS Title,
        p.published_at AS PublishedAt,
        t.id AS TriageId,
        t.accepted AS TriageAccepted,
        t.reason AS TriageReason,
        t.prompt_version AS TriagePromptVersion,
        t.created_at AS DecidedAt,
        (SELECT COUNT(*) FROM candidate c WHERE c.publication_id = p.id AND ${VISIBLE_CANDIDATE})
          AS CandidateCount,
        (SELECT COUNT(*) FROM current_review cr
          WHERE cr.publication_id = p.id
            AND (cr.target_kind = 'triage' AND cr.target_id = t.id
              OR cr.target_kind = 'candidate' AND EXISTS (
                SELECT 1 FROM candidate c WHERE c.id = cr.target_id AND ${VISIBLE_CANDIDATE})))
          AS ReviewedTargets
      FROM triage_decision t
      JOIN publication p ON p.id = t.publication_id
      ${inner.length ? `WHERE ${inner.join(" AND ")}` : ""}
    )
    SELECT * FROM rows
    ${outer.length ? `WHERE ${outer.join(" AND ")}` : ""}
    ORDER BY DecidedAt DESC, TriageId DESC
    LIMIT ?`;

  const { results } = await db
    .prepare(sql)
    .bind(...innerValues, ...outerValues, query.Limit + 1)
    .all<ListRow>();

  const page = results.slice(0, query.Limit);
  const items: ReviewListItem[] = page.map((row) => ({
    PublicationId: row.PublicationId,
    Title: row.Title,
    PublishedAt: row.PublishedAt,
    TriageId: row.TriageId,
    TriageAccepted: row.TriageAccepted === 1,
    TriageReason: row.TriageReason,
    TriagePromptVersion: row.TriagePromptVersion,
    DecidedAt: row.DecidedAt,
    CandidateCount: row.CandidateCount,
    ReviewedTargets: row.ReviewedTargets,
    Targets: row.CandidateCount + 1,
  }));
  const last = page[page.length - 1];
  return {
    Items: items,
    NextCursor:
      results.length > query.Limit && last ? encodeCursor(last.DecidedAt, last.TriageId) : null,
  };
}

type TriageRow = {
  id: string;
  status: "decided" | "awaiting-admission";
  accepted: number;
  score: number | null;
  reason: TriageReason | null;
  signal_named_party: number | null;
  signal_stated_harm: number | null;
  signal_trigger: number | null;
  signal_existing_alternative: number | null;
  signal_adoptable: number | null;
  notes: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
};

type ReviewRow = {
  id: string;
  target_kind: ReviewTargetKind;
  target_id: string;
  publication_id: string;
  verdict: ReviewVerdict;
  note: string | null;
  corrected: string | null;
  tags_json: string;
  corrected_json: string | null;
  withdrawn_at: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
};

type Correction = { Signals?: TriageSignals; Candidate?: CandidateCorrection };

function parseCorrection(row: ReviewRow): Correction {
  return row.corrected_json ? (JSON.parse(row.corrected_json) as Correction) : {};
}

function current(row: ReviewRow | undefined): CurrentVerdict | null {
  if (!row) {
    return null;
  }
  const correction = parseCorrection(row);
  return {
    Verdict: row.verdict,
    Note: row.note,
    Corrected: row.corrected,
    Tags: JSON.parse(row.tags_json) as ReviewTag[],
    CorrectedSignals: correction.Signals ?? null,
    CorrectedCandidate: correction.Candidate ?? null,
    CreatedAt: row.created_at,
  };
}

/** Spans of the abstract that the candidates quote, with ADR 0064 normalisation (REQ-REV-002 AC4). */
export function abstractHighlights(
  abstract: string | null,
  candidates: ReviewCandidate[],
): AbstractHighlight[] {
  if (!abstract) {
    return [];
  }
  const highlights: AbstractHighlight[] = [];
  for (const candidate of candidates) {
    for (const field of CANDIDATE_QUOTE_FIELDS) {
      const quote = candidate[field];
      if (!quote) {
        continue;
      }
      const span = findQuoteSpan(abstract, quote);
      if (span === null) {
        continue;
      }
      const start = abstract.indexOf(span);
      highlights.push({
        Start: start,
        End: start + span.length,
        CandidateId: candidate.Id,
        Field: field,
      });
    }
  }
  return highlights.sort((a, b) => a.Start - b.Start || a.End - b.End);
}

const flag = (value: number | null): boolean => value === 1;

/** One publication with all its model output and current verdicts (REQ-REV-002), or null. */
export async function getPublication(
  db: SqlDatabase,
  publicationId: string,
): Promise<ReviewDetailResponse | null> {
  const [publication, triage] = await Promise.all([
    db
      .prepare(
        "SELECT id, title, abstract, published_at, doi, arxiv_id FROM publication WHERE id = ?",
      )
      .bind(publicationId)
      .first<{
        id: string;
        title: string;
        abstract: string | null;
        published_at: string | null;
        doi: string | null;
        arxiv_id: string | null;
      }>(),
    db
      .prepare("SELECT * FROM triage_decision WHERE publication_id = ?")
      .bind(publicationId)
      .first<TriageRow>(),
  ]);
  if (!publication || !triage) {
    return null;
  }

  const [extraction, candidates, reviews, previous, next] = await Promise.all([
    db
      .prepare(
        "SELECT id, model, prompt_version, input_mode, confidence, notes, created_at FROM extraction_result WHERE publication_id = ?",
      )
      .bind(publicationId)
      .first<{
        id: string;
        model: string;
        prompt_version: string;
        input_mode: InputMode;
        confidence: number;
        notes: string | null;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT c.* FROM candidate c WHERE c.publication_id = ? AND ${VISIBLE_CANDIDATE} ORDER BY c.created_at, c.id`,
      )
      .bind(publicationId)
      .all<{
        id: string;
        finding: string;
        evidence_quote: string;
        customer: string;
        customer_quote: string;
        why_now: string | null;
        why_now_quote: string | null;
        current_alternative: string | null;
        alternative_quote: string | null;
      }>(),
    db
      .prepare(`WITH ${CURRENT_REVIEW} SELECT * FROM current_review WHERE publication_id = ?`)
      .bind(publicationId)
      .all<ReviewRow>(),
    db
      .prepare(
        "SELECT publication_id FROM triage_decision WHERE created_at > ? OR (created_at = ? AND id > ?) ORDER BY created_at ASC, id ASC LIMIT 1",
      )
      .bind(triage.created_at, triage.created_at, triage.id)
      .first<{ publication_id: string }>(),
    db
      .prepare(
        "SELECT publication_id FROM triage_decision WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .bind(triage.created_at, triage.created_at, triage.id)
      .first<{ publication_id: string }>(),
  ]);

  const byTarget = new Map(
    reviews.results.map((row) => [`${row.target_kind}:${row.target_id}`, row] as const),
  );
  const reviewCandidates: ReviewCandidate[] = candidates.results.map((row) => ({
    Id: row.id,
    Finding: row.finding,
    EvidenceQuote: row.evidence_quote,
    Customer: row.customer,
    CustomerQuote: row.customer_quote,
    WhyNow: row.why_now,
    WhyNowQuote: row.why_now_quote,
    CurrentAlternative: row.current_alternative,
    AlternativeQuote: row.alternative_quote,
    Current: current(byTarget.get(`candidate:${row.id}`)),
  }));
  const ruled = triage.model === null;

  return {
    Publication: {
      Id: publication.id,
      Title: publication.title,
      Abstract: publication.abstract,
      PublishedAt: publication.published_at,
      Doi: publication.doi,
      ArxivId: publication.arxiv_id,
    },
    Triage: {
      Id: triage.id,
      Status: triage.status,
      Accepted: triage.accepted === 1,
      Score: triage.score,
      Reason: triage.reason,
      Signals: ruled
        ? null
        : {
            NamedParty: flag(triage.signal_named_party),
            StatedHarm: flag(triage.signal_stated_harm),
            Trigger: flag(triage.signal_trigger),
            ExistingAlternative: flag(triage.signal_existing_alternative),
            Adoptable: flag(triage.signal_adoptable),
          },
      Notes: triage.notes,
      Model: triage.model,
      PromptVersion: triage.prompt_version,
      CreatedAt: triage.created_at,
      Current: current(byTarget.get(`triage:${triage.id}`)),
    },
    Extraction: extraction
      ? {
          Id: extraction.id,
          Model: extraction.model,
          PromptVersion: extraction.prompt_version,
          InputMode: extraction.input_mode,
          Confidence: extraction.confidence,
          Notes: extraction.notes,
          CreatedAt: extraction.created_at,
        }
      : null,
    Candidates: reviewCandidates,
    Highlights: abstractHighlights(publication.abstract, reviewCandidates),
    PreviousId: previous?.publication_id ?? null,
    NextId: next?.publication_id ?? null,
  };
}

export type VerdictDeps = { Db: SqlDatabase; NewId: () => string; Now: () => string };

export type RecordResult =
  | { Kind: "stored"; Current: CurrentVerdict }
  | { Kind: "not-found" }
  | { Kind: "invalid"; Message: string };

type Target = {
  publication_id: string;
  model: string | null;
  prompt_version: string | null;
  input_mode: InputMode | null;
  abstract: string | null;
};

async function findTarget(
  db: SqlDatabase,
  kind: ReviewTargetKind,
  id: string,
): Promise<Target | null> {
  return kind === "triage"
    ? db
        .prepare(
          `SELECT t.publication_id, t.model, t.prompt_version, NULL AS input_mode, p.abstract
           FROM triage_decision t JOIN publication p ON p.id = t.publication_id
           WHERE t.id = ?`,
        )
        .bind(id)
        .first<Target>()
    : db
        .prepare(
          `SELECT c.publication_id, e.model, e.prompt_version, e.input_mode, p.abstract
           FROM candidate c
           JOIN extraction_result e ON e.id = c.extraction_result_id
           JOIN publication p ON p.id = c.publication_id
           WHERE c.id = ? AND ${VISIBLE_CANDIDATE}`,
        )
        .bind(id)
        .first<Target>();
}

/**
 * A corrected quote must occur in the text the step read (REQ-REV-008 AC2). Only abstract input
 * can be checked here; full text is checked once the tool reads stored texts.
 */
function quoteProblem(target: Target, correction: CandidateCorrection | null): string | null {
  if (!correction || target.input_mode !== "abstract" || !target.abstract) {
    return null;
  }
  for (const field of ["EvidenceQuote", "CustomerQuote"] as const) {
    const quote = correction[field];
    if (quote !== undefined && !quoteOccurs(target.abstract, quote)) {
      return `the corrected ${field} does not occur in the abstract`;
    }
  }
  return null;
}

/**
 * Stores a verdict on a triage decision or a visible candidate (REQ-REV-003), with its error tags
 * (REQ-REV-007) and structured correction (REQ-REV-008), copying the model and prompt version of
 * the judged output.
 */
export async function recordVerdict(
  deps: VerdictDeps,
  verdict: RecordVerdict,
  reviewer: string,
): Promise<RecordResult> {
  const target = await findTarget(deps.Db, verdict.TargetKind, verdict.TargetId);
  if (!target) {
    return { Kind: "not-found" };
  }
  const problem = quoteProblem(target, verdict.CorrectedCandidate);
  if (problem) {
    return { Kind: "invalid", Message: problem };
  }
  const correction: Correction = {
    ...(verdict.CorrectedSignals ? { Signals: verdict.CorrectedSignals } : {}),
    ...(verdict.CorrectedCandidate ? { Candidate: verdict.CorrectedCandidate } : {}),
  };
  const createdAt = deps.Now();
  await deps.Db.prepare(
    `INSERT INTO output_review (
      id, target_kind, target_id, publication_id, verdict, corrected, note, reviewer_opaque,
      model, prompt_version, created_at, tags_json, corrected_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      deps.NewId(),
      verdict.TargetKind,
      verdict.TargetId,
      target.publication_id,
      verdict.Verdict,
      verdict.Corrected,
      verdict.Note,
      reviewer,
      target.model,
      target.prompt_version,
      createdAt,
      JSON.stringify(verdict.Tags),
      Object.keys(correction).length ? JSON.stringify(correction) : null,
    )
    .run();
  return {
    Kind: "stored",
    Current: {
      Verdict: verdict.Verdict,
      Note: verdict.Note,
      Corrected: verdict.Corrected,
      Tags: verdict.Tags,
      CorrectedSignals: verdict.CorrectedSignals,
      CorrectedCandidate: verdict.CorrectedCandidate,
      CreatedAt: createdAt,
    },
  };
}

/** The current verdict of one target, or null. */
async function currentVerdict(
  db: SqlDatabase,
  kind: ReviewTargetKind,
  id: string,
): Promise<CurrentVerdict | null> {
  const row = await db
    .prepare(
      `SELECT * FROM output_review
       WHERE target_kind = ? AND target_id = ? AND withdrawn_at IS NULL
       ORDER BY rowid DESC LIMIT 1`,
    )
    .bind(kind, id)
    .first<ReviewRow>();
  return current(row ?? undefined);
}

/**
 * Withdraws the current verdict of a target (REQ-REV-008 AC3): the row stays as history, and the
 * verdict before it, if any, becomes current again. Returns null when there was nothing to undo.
 */
export async function undoVerdict(
  deps: Omit<VerdictDeps, "NewId">,
  kind: ReviewTargetKind,
  id: string,
): Promise<{ Current: CurrentVerdict | null } | null> {
  const latest = await deps.Db.prepare(
    `SELECT rowid AS rid FROM output_review
     WHERE target_kind = ? AND target_id = ? AND withdrawn_at IS NULL
     ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(kind, id)
    .first<{ rid: number }>();
  if (!latest) {
    return null;
  }
  await deps.Db.prepare("UPDATE output_review SET withdrawn_at = ? WHERE rowid = ?")
    .bind(deps.Now(), latest.rid)
    .run();
  return { Current: await currentVerdict(deps.Db, kind, id) };
}

/** Current verdicts per step and prompt version (REQ-REV-004 AC1). */
export async function reviewStats(db: SqlDatabase): Promise<ReviewStatsRow[]> {
  const { results } = await db
    .prepare(
      `WITH ${CURRENT_REVIEW}
       SELECT target_kind AS TargetKind, prompt_version AS PromptVersion,
         SUM(verdict = 'correct') AS Correct,
         SUM(verdict = 'incorrect') AS Incorrect,
         SUM(verdict = 'unsure') AS Unsure
       FROM current_review
       GROUP BY target_kind, prompt_version
       ORDER BY target_kind DESC, prompt_version`,
    )
    .all<Omit<ReviewStatsRow, "Agreement">>();
  return results.map((row) => ({ ...row, Agreement: agreementRate(row.Correct, row.Incorrect) }));
}

/** Every stored verdict, oldest first (REQ-REV-004 AC2). */
export async function exportVerdicts(db: SqlDatabase): Promise<ReviewExportLine[]> {
  const { results } = await db
    .prepare("SELECT * FROM output_review ORDER BY rowid ASC")
    .all<ReviewRow>();
  return results.map((row) => ({
    Id: row.id,
    TargetKind: row.target_kind,
    TargetId: row.target_id,
    PublicationId: row.publication_id,
    Verdict: row.verdict,
    Note: row.note,
    Corrected: row.corrected,
    Tags: JSON.parse(row.tags_json) as ReviewTag[],
    CorrectedSignals: parseCorrection(row).Signals ?? null,
    CorrectedCandidate: parseCorrection(row).Candidate ?? null,
    Model: row.model,
    PromptVersion: row.prompt_version,
    CreatedAt: row.created_at,
    WithdrawnAt: row.withdrawn_at,
  }));
}
