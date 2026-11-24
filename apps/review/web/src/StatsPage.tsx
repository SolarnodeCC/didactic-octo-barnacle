import type { ReviewStatsRow } from "@roi/models";
import { useEffect, useState } from "react";

import { EXPORT_PATH, getStats } from "./api.js";
import { percent } from "./text.js";
import { ErrorNotice } from "./ui.js";

/** Agreement per step and prompt version, and the verdict export (REQ-REV-004). */
export function StatsPage() {
  const [rows, setRows] = useState<ReviewStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then((body) => setRows(body.Rows))
      .catch((e: unknown) => setError(String((e as Error).message)));
  }, []);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Current verdicts. Agreement is correct ÷ (correct + incorrect); unsure is left out.
        </p>
        <a
          href={EXPORT_PATH}
          download
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Export verdicts (JSON lines)
        </a>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2">Step</th>
              <th className="px-3 py-2">Prompt version</th>
              <th className="px-3 py-2 text-right">Correct</th>
              <th className="px-3 py-2 text-right">Incorrect</th>
              <th className="px-3 py-2 text-right">Unsure</th>
              <th className="px-3 py-2 text-right">Agreement</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => (
              <tr
                key={`${row.TargetKind}:${row.PromptVersion ?? ""}`}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-3 py-2">
                  {row.TargetKind === "triage" ? "Triage" : "Extraction candidate"}
                </td>
                <td className="px-3 py-2">{row.PromptVersion ?? "rule"}</td>
                <td className="px-3 py-2 text-right">{row.Correct}</td>
                <td className="px-3 py-2 text-right">{row.Incorrect}</td>
                <td className="px-3 py-2 text-right">{row.Unsure}</td>
                <td className="px-3 py-2 text-right font-medium">{percent(row.Agreement)}</td>
              </tr>
            ))}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No verdicts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
