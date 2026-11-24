import type { ReviewListItem } from "@roi/models";
import { useEffect, useState } from "react";

import { listPublications, type ListFilters } from "./api.js";
import { Link, navigate } from "./router.js";
import { ErrorNotice } from "./ui.js";

const REASONS = ["accepted", "low-score", "daily-limit", "incomplete", "retracted", "out-of-scope"];

function filtersFrom(search: URLSearchParams): ListFilters {
  const read = (key: string) => search.get(key) ?? "";
  return {
    accepted: read("accepted"),
    reason: read("reason"),
    reviewed: read("reviewed"),
    promptVersion: read("promptVersion"),
    day: read("day"),
  };
}

/** The review list with its filters in the URL, so a view can be reopened (REQ-REV-001). */
export function ListPage({ search }: { search: URLSearchParams }) {
  const key = search.toString();
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = filtersFrom(search);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listPublications(filtersFrom(new URLSearchParams(key)))
      .then((page) => {
        if (cancelled) return;
        setItems(page.Items);
        setCursor(page.NextCursor);
      })
      .catch((e: unknown) => !cancelled && setError(String((e as Error).message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = (name: keyof ListFilters, value: string) => {
    const next = new URLSearchParams(key);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    navigate(query ? `/browse?${query}` : "/browse");
  };

  const more = () => {
    if (!cursor) return;
    setLoading(true);
    listPublications(filters, cursor)
      .then((page) => {
        setItems((current) => [...current, ...page.Items]);
        setCursor(page.NextCursor);
      })
      .catch((e: unknown) => setError(String((e as Error).message)))
      .finally(() => setLoading(false));
  };

  const select =
    "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Outcome
          <select
            className={select}
            value={filters.accepted}
            onChange={(e) => update("accepted", e.target.value)}
          >
            <option value="">All</option>
            <option value="yes">Accepted</option>
            <option value="no">Rejected</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Reason
          <select
            className={select}
            value={filters.reason}
            onChange={(e) => update("reason", e.target.value)}
          >
            <option value="">All</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Review
          <select
            className={select}
            value={filters.reviewed}
            onChange={(e) => update("reviewed", e.target.value)}
          >
            <option value="">All</option>
            <option value="no">Not fully reviewed</option>
            <option value="yes">Reviewed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Prompt version
          <input
            className={select}
            defaultValue={filters.promptVersion}
            placeholder="e.g. triage-v1"
            onBlur={(e) => update("promptVersion", e.target.value.trim())}
            onKeyDown={(e) =>
              e.key === "Enter" && update("promptVersion", e.currentTarget.value.trim())
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Decision day
          <input
            type="date"
            className={select}
            value={filters.day}
            onChange={(e) => update("day", e.target.value)}
          />
        </label>
        {key && (
          <button
            type="button"
            className="text-sm text-slate-500 underline"
            onClick={() => navigate("/browse")}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <ErrorNotice message={error} />}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2">Publication</th>
              <th className="px-3 py-2">Triage</th>
              <th className="px-3 py-2">Candidates</th>
              <th className="px-3 py-2">Reviewed</th>
              <th className="px-3 py-2">Decided</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.PublicationId}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="max-w-md px-3 py-2">
                  <Link
                    href={`/p/${encodeURIComponent(item.PublicationId)}`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {item.Title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      item.TriageAccepted
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {item.TriageAccepted ? "Accepted" : "Rejected"}
                  </span>{" "}
                  <span className="text-xs text-slate-500">{item.TriageReason ?? "waiting"}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{item.CandidateCount}</td>
                <td className="px-3 py-2 tabular-nums">
                  {item.ReviewedTargets} / {item.Targets}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {item.DecidedAt.slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No triaged publications match. Processing must be on in staging for output to
                  appear.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {cursor && (
          <button
            type="button"
            disabled={loading}
            onClick={more}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Load more
          </button>
        )}
        {loading && <span className="text-sm text-slate-500">Loading…</span>}
      </div>
    </section>
  );
}
