import {
  DEFAULT_ACCEPT_SCORE_CUT,
  REVIEW_DAILY_SAMPLE_DEFAULT,
  type ReviewQueueItem,
  type ReviewQueueResponse,
  type ReviewStratum,
} from "@roi/models";

import { type SqlDatabase } from "./sql.js";
import { CURRENT_REVIEW, VISIBLE_CANDIDATE } from "./store.js";

/**
 * The daily review queue (REQ-REV-006, ADR 0124): a small sample of one decision day, drawn so
 * that the items are informative (borderline decisions, empty or unsure extractions, new prompt
 * versions) with a random share that keeps the agreement rate honest.
 */

/** One triage decision of the day, with what the strata need to know about it. */
export type PoolItem = {
  PublicationId: string;
  Accepted: boolean;
  Reason: string | null;
  /** Null for a rule decision (no model call). */
  Score: number | null;
  ModelDecided: boolean;
  HasExtraction: boolean;
  VisibleCandidates: number;
  Confidence: number | null;
  /** The triage or extraction prompt version first appeared within the last three days. */
  NewPrompt: boolean;
};

/** Share of the sample each stratum may fill, in the order they are filled. Random takes the rest. */
export const STRATUM_SHARES: readonly [Exclude<ReviewStratum, "random">, number][] = [
  ["new-prompt", 0.2],
  ["borderline", 0.25],
  ["accepted-empty", 0.15],
  ["low-confidence", 0.15],
  ["model-rejection", 0.1],
];

/** One signal is a fifth of the triage score (REQ-PROC-008). */
const ONE_SIGNAL = 0.2;
const LOW_CONFIDENCE = 0.5;
const NEW_PROMPT_DAYS = 3;

const IN_STRATUM: Record<Exclude<ReviewStratum, "random">, (item: PoolItem) => boolean> = {
  "new-prompt": (item) => item.NewPrompt,
  borderline: (item) =>
    item.ModelDecided &&
    item.Score !== null &&
    Math.abs(item.Score - DEFAULT_ACCEPT_SCORE_CUT) < ONE_SIGNAL,
  "accepted-empty": (item) => item.Accepted && item.HasExtraction && item.VisibleCandidates === 0,
  "low-confidence": (item) => item.Confidence !== null && item.Confidence < LOW_CONFIDENCE,
  "model-rejection": (item) => item.ModelDecided && item.Reason === "low-score",
};

/** A 32-bit FNV-1a hash, to seed the draw with the day. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** mulberry32: a small seeded generator, so a day's draw is the same on every run. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws the sample of a day: each stratum takes up to its share of `size` from a seeded shuffle
 * of the pool, and random items fill the rest. The same pool and day always give the same sample.
 */
export function drawSample(
  pool: readonly PoolItem[],
  size: number,
  day: string,
): { PublicationId: string; Stratum: ReviewStratum }[] {
  const random = generator(hash(day));
  const shuffled = [...pool].sort((a, b) => a.PublicationId.localeCompare(b.PublicationId));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as PoolItem, shuffled[i] as PoolItem];
  }
  const picked = new Map<string, ReviewStratum>();
  for (const [stratum, share] of STRATUM_SHARES) {
    const quota = Math.floor(size * share);
    let taken = 0;
    for (const item of shuffled) {
      if (taken >= quota || picked.size >= size) break;
      if (!picked.has(item.PublicationId) && IN_STRATUM[stratum](item)) {
        picked.set(item.PublicationId, stratum);
        taken += 1;
      }
    }
  }
  for (const item of shuffled) {
    if (picked.size >= size) break;
    if (!picked.has(item.PublicationId)) picked.set(item.PublicationId, "random");
  }
  // Mix the strata, so the queue does not start with all borderline items.
  return shuffled
    .filter((item) => picked.has(item.PublicationId))
    .map((item) => ({
      PublicationId: item.PublicationId,
      Stratum: picked.get(item.PublicationId) as ReviewStratum,
    }));
}

/** The sample size from `REVIEW_DAILY_SAMPLE`, between 5 and 100 (`review.daily_sample`). */
export function sampleSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(5, parsed)) : REVIEW_DAILY_SAMPLE_DEFAULT;
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

type PoolRow = {
  PublicationId: string;
  Accepted: number;
  Reason: string | null;
  Score: number | null;
  Model: string | null;
  TriagePrompt: string | null;
  ExtractionPrompt: string | null;
  HasExtraction: number;
  Confidence: number | null;
  VisibleCandidates: number;
};

async function loadPool(db: SqlDatabase, day: string): Promise<PoolItem[]> {
  const [rows, firstSeen] = await Promise.all([
    db
      .prepare(
        `SELECT t.publication_id AS PublicationId, t.accepted AS Accepted, t.reason AS Reason,
           t.score AS Score, t.model AS Model, t.prompt_version AS TriagePrompt,
           e.prompt_version AS ExtractionPrompt, e.id IS NOT NULL AS HasExtraction,
           e.confidence AS Confidence,
           (SELECT COUNT(*) FROM candidate c WHERE c.publication_id = t.publication_id AND ${VISIBLE_CANDIDATE})
             AS VisibleCandidates
         FROM triage_decision t
         LEFT JOIN extraction_result e ON e.publication_id = t.publication_id
         WHERE substr(t.created_at, 1, 10) = ?`,
      )
      .bind(day)
      .all<PoolRow>(),
    db
      .prepare(
        `SELECT prompt_version AS Version, MIN(substr(created_at, 1, 10)) AS FirstDay
         FROM triage_decision WHERE prompt_version IS NOT NULL GROUP BY prompt_version
         UNION ALL
         SELECT prompt_version, MIN(substr(created_at, 1, 10))
         FROM extraction_result GROUP BY prompt_version`,
      )
      .all<{ Version: string; FirstDay: string }>(),
  ]);
  const recent = daysBefore(day, NEW_PROMPT_DAYS - 1);
  const newVersions = new Set(
    firstSeen.results.filter((row) => row.FirstDay >= recent).map((row) => row.Version),
  );
  // Every version is new on the first days of a fresh database; then the stratum means nothing.
  const allNew =
    firstSeen.results.length > 0 &&
    newVersions.size === new Set(firstSeen.results.map((r) => r.Version)).size;
  return rows.results.map((row) => ({
    PublicationId: row.PublicationId,
    Accepted: row.Accepted === 1,
    Reason: row.Reason,
    Score: row.Score,
    ModelDecided: row.Model !== null,
    HasExtraction: row.HasExtraction === 1,
    VisibleCandidates: row.VisibleCandidates,
    Confidence: row.Confidence,
    NewPrompt:
      !allNew &&
      ((row.TriagePrompt !== null && newVersions.has(row.TriagePrompt)) ||
        (row.ExtractionPrompt !== null && newVersions.has(row.ExtractionPrompt))),
  }));
}

/**
 * Stores the sample of a day the first time it is opened, and tops it up when the day's run
 * added decisions after that, so an early visit does not leave a short queue. Items already in
 * the sample never change.
 */
async function ensureSample(
  db: SqlDatabase,
  day: string,
  size: number,
  now: string,
): Promise<void> {
  const existing = await db
    .prepare("SELECT publication_id AS id FROM review_sample WHERE day = ?")
    .bind(day)
    .all<{ id: string }>();
  if (existing.results.length >= size) {
    return;
  }
  const have = new Set(existing.results.map((row) => row.id));
  const additions = drawSample(await loadPool(db, day), size, day)
    .filter((item) => !have.has(item.PublicationId))
    .slice(0, size - have.size);
  if (additions.length === 0) {
    return;
  }
  await db.batch(
    additions.map((item, index) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO review_sample (day, publication_id, stratum, position, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(day, item.PublicationId, item.Stratum, have.size + index, now),
    ),
  );
}

/** The queue of a day, or of the newest decision day when none is given (REQ-REV-006). */
export async function getQueue(
  db: SqlDatabase,
  options: { Day?: string | undefined; Size: number; Now: string },
): Promise<ReviewQueueResponse> {
  const days = (
    await db
      .prepare(
        "SELECT DISTINCT substr(created_at, 1, 10) AS day FROM triage_decision ORDER BY day DESC LIMIT 14",
      )
      .all<{ day: string }>()
  ).results.map((row) => row.day);
  const day = options.Day ?? days[0] ?? null;
  if (day === null) {
    return { Day: null, Items: [], Done: 0, Days: [] };
  }
  await ensureSample(db, day, options.Size, options.Now);
  const { results } = await db
    .prepare(
      `WITH ${CURRENT_REVIEW}
       SELECT s.publication_id AS PublicationId, p.title AS Title, s.stratum AS Stratum,
         1 + (SELECT COUNT(*) FROM candidate c WHERE c.publication_id = s.publication_id AND ${VISIBLE_CANDIDATE})
           AS Targets,
         (SELECT COUNT(*) FROM current_review cr
           WHERE cr.publication_id = s.publication_id
             AND (cr.target_kind = 'triage'
               OR cr.target_kind = 'candidate' AND EXISTS (
                 SELECT 1 FROM candidate c WHERE c.id = cr.target_id AND ${VISIBLE_CANDIDATE})))
           AS ReviewedTargets
       FROM review_sample s JOIN publication p ON p.id = s.publication_id
       WHERE s.day = ?
       ORDER BY s.position`,
    )
    .bind(day)
    .all<ReviewQueueItem>();
  return {
    Day: day,
    Items: results,
    Done: results.filter((item) => item.ReviewedTargets >= item.Targets).length,
    Days: days.includes(day) ? days : [day, ...days],
  };
}
