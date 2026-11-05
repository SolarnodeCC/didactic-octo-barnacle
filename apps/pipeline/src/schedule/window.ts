const DAY_MS = 24 * 60 * 60 * 1000;

/** The day `days` before `date` (YYYY-MM-DD). */
export function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The oldest day any run may fetch or store: `MaxAgeDays` before the day of the run. No
 * window, fresh or continued, starts before it (REQ-DATA-009 AC3, ADR 0041).
 */
export function earliestWindowStart(today: string, maxAgeDays: number): string {
  return shiftDays(today, -maxAgeDays);
}

/**
 * First day a run fetches (REQ-DATA-009). A first run backfills `BackfillDays`.
 * Later runs start `OverlapDays` before the end of the last successful window, but
 * never further back than `MaxAgeDays`, so a source that keeps failing cannot
 * make the window grow without bound (ADR 0041).
 */
export function windowStart(options: {
  /** End date (YYYY-MM-DD) of the last successful run, or null when there is none. */
  LastWindowEnd: string | null;
  /** Today, UTC (YYYY-MM-DD). */
  Today: string;
  OverlapDays: number;
  BackfillDays: number;
  MaxAgeDays: number;
}): string {
  if (options.LastWindowEnd === null) {
    return shiftDays(options.Today, -Math.min(options.BackfillDays, options.MaxAgeDays));
  }
  const earliest = earliestWindowStart(options.Today, options.MaxAgeDays);
  const start = shiftDays(options.LastWindowEnd, -options.OverlapDays);
  return start < earliest ? earliest : start;
}
