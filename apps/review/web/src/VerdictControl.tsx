import type { CurrentVerdict, ReviewTargetKind, ReviewVerdict } from "@roi/models";
import { useState } from "react";

import { recordVerdict } from "./api.js";
import { CORRECTED_MAX, NOTE_MAX } from "./text.js";

export const VERDICTS: { Value: ReviewVerdict; Label: string; Key: string; Tone: string }[] = [
  { Value: "correct", Label: "Correct", Key: "1", Tone: "bg-emerald-600 text-white" },
  { Value: "incorrect", Label: "Incorrect", Key: "2", Tone: "bg-red-600 text-white" },
  { Value: "unsure", Label: "Unsure", Key: "3", Tone: "bg-amber-500 text-white" },
];

export type VerdictTarget = { Kind: ReviewTargetKind; Id: string; Current: CurrentVerdict | null };

/** Verdict buttons with an optional note and correction (REQ-REV-003). */
export function VerdictControl({
  target,
  selected,
  onSaved,
  registerSave,
}: {
  target: VerdictTarget;
  selected: boolean;
  onSaved: (verdict: CurrentVerdict) => void;
  /** Lets the page record a verdict from the keyboard with the note typed here. */
  registerSave: (save: (verdict: ReviewVerdict) => void) => void;
}) {
  const [note, setNote] = useState(target.Current?.Note ?? "");
  const [corrected, setCorrected] = useState(target.Current?.Corrected ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (verdict: ReviewVerdict) => {
    setSaving(true);
    setError(null);
    recordVerdict({
      TargetKind: target.Kind,
      TargetId: target.Id,
      Verdict: verdict,
      Note: note,
      Corrected: corrected,
    })
      .then(onSaved)
      .catch((e: unknown) => setError(String((e as Error).message)))
      .finally(() => setSaving(false));
  };
  registerSave(save);

  const input =
    "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950";

  return (
    <div
      className={`mt-3 rounded-md border p-3 ${selected ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-slate-800"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {VERDICTS.map((verdict) => {
          const active = target.Current?.Verdict === verdict.Value;
          return (
            <button
              key={verdict.Value}
              type="button"
              disabled={saving}
              onClick={() => save(verdict.Value)}
              aria-pressed={active}
              className={`rounded px-2.5 py-1 text-sm font-medium disabled:opacity-50 ${
                active
                  ? verdict.Tone
                  : "border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {verdict.Label}
              <kbd className="ml-1.5 text-xs opacity-60">{verdict.Key}</kbd>
            </button>
          );
        })}
        {target.Current && (
          <span className="text-xs text-slate-500">
            Saved {target.Current.CreatedAt.slice(0, 16).replace("T", " ")}
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          Note ({note.length}/{NOTE_MAX})
          <textarea
            className={input}
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Corrected value (optional)
          <textarea
            className={input}
            rows={2}
            maxLength={CORRECTED_MAX}
            value={corrected}
            onChange={(e) => setCorrected(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
