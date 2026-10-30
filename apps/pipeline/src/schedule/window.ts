const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * First day a run fetches (REQ-DATA-009). A first run backfills `BackfillDays`.
 * Later runs start `OverlapDays` before the end of the last successful window, but
 * never further back than `BackfillDays`, so a source that keeps failing cannot
 * make the window grow without bound.
 */
export function windowStart(options: {
  /** End date (YYYY-MM-DD) of the last successful run, or null when there is none. */
  LastWindowEnd: string | null;
  /** Today, UTC (YYYY-MM-DD). */
  Today: string;
  OverlapDays: number;
  BackfillDays: number;
}): string {
  const earliest = shiftDays(options.Today, -options.BackfillDays);
  if (options.LastWindowEnd === null) {
    return earliest;
  }
  const start = shiftDays(options.LastWindowEnd, -options.OverlapDays);
  return start < earliest ? earliest : start;
}
