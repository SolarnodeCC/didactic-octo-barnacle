import type { ReviewQueueResponse } from "@roi/models";
import { useCallback, useEffect, useState } from "react";

import { getQueue } from "./api.js";
import { ReviewPanel } from "./ReviewPanel.js";
import { STRATUM_TEXT } from "./review-rules.js";
import { navigate } from "./router.js";
import { ErrorNotice } from "./ui.js";

/**
 * The daily review queue (REQ-REV-006): one publication at a time from the day's sample, with
 * progress, and an automatic move to the next open item once all of a publication is reviewed.
 */
export function TodayPage({ search }: { search: URLSearchParams }) {
  const day = search.get("day") ?? undefined;
  const position = search.get("i");
  const [queue, setQueue] = useState<ReviewQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getQueue(day)
      .then(setQueue)
      .catch((e: unknown) => setError(String((e as Error).message)));
  }, [day]);
  useEffect(refresh, [refresh]);

  if (error) return <ErrorNotice message={error} />;
  if (!queue) return <p className="text-sm text-slate-500">Loading today’s queue…</p>;
  if (queue.Day === null || queue.Items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        No triage decisions to review yet. Output appears once processing runs in staging (
        <code>PROCESSING_ENABLED</code>).
      </div>
    );
  }

  const open = (i: number) => {
    const params = new URLSearchParams();
    if (day) params.set("day", day);
    params.set("i", String(i));
    navigate(`/?${params.toString()}`);
  };
  const firstOpen = queue.Items.findIndex((item) => item.ReviewedTargets < item.Targets);
  const index =
    position !== null ? Math.min(Number(position) || 0, queue.Items.length - 1) : firstOpen;
  const progress = Math.round((queue.Done / queue.Items.length) * 100);

  const dayPicker = (
    <select
      aria-label="Decision day"
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
      value={queue.Day}
      onChange={(e) => navigate(`/?day=${e.target.value}`)}
    >
      {queue.Days.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {dayPicker}
        <div
          className="h-2 w-40 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={queue.Done}
          aria-valuemax={queue.Items.length}
          aria-label="Reviewed today"
        >
          <div className="h-full bg-emerald-600" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
          {queue.Done} of {queue.Items.length} reviewed
        </span>
      </div>
      {index >= 0 && (
        <span className="text-xs text-slate-500">
          Item {index + 1} · picked because:{" "}
          <strong>{STRATUM_TEXT[queue.Items[index]?.Stratum ?? "random"]}</strong>
        </span>
      )}
    </div>
  );

  if (index === -1) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950">
          <p className="text-lg font-semibold">
            All {queue.Items.length} reviewed for {queue.Day}.
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            See the Summary for agreement, or pick an earlier day.
          </p>
          <button type="button" className="mt-3 text-sm underline" onClick={() => open(0)}>
            Go through them again
          </button>
        </div>
      </section>
    );
  }

  const item = queue.Items[index];
  if (!item) return null;
  const nextOpen = () => {
    const after = queue.Items.findIndex((it, i) => i > index && it.ReviewedTargets < it.Targets);
    const any = queue.Items.findIndex((it, i) => i !== index && it.ReviewedTargets < it.Targets);
    const target = after !== -1 ? after : any;
    if (target === -1) {
      const params = new URLSearchParams(day ? { day } : {});
      navigate(params.toString() ? `/?${params.toString()}` : "/");
      refresh();
    } else open(target);
  };

  return (
    <ReviewPanel
      key={item.PublicationId}
      id={item.PublicationId}
      header={header}
      navigation={{
        PreviousLabel: "Previous in queue",
        NextLabel: "Next in queue",
        onPrevious: index > 0 ? () => open(index - 1) : null,
        onNext: index < queue.Items.length - 1 ? () => open(index + 1) : null,
      }}
      onProgress={refresh}
      onComplete={nextOpen}
    />
  );
}
