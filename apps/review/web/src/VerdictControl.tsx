import type { CurrentVerdict, ReviewTag, ReviewTargetKind, ReviewVerdict } from "@roi/models";

import { TAG_OPTIONS, tagLabel } from "./review-rules.js";
import { NOTE_MAX } from "./text.js";

/** The open reason picker of one target: the verdict being given and the tags chosen so far. */
export type Picker = {
  Index: number;
  Verdict: Exclude<ReviewVerdict, "correct">;
  Tags: ReviewTag[];
};

export const VERDICTS: { Value: ReviewVerdict; Label: string; Key: string; Tone: string }[] = [
  { Value: "correct", Label: "Correct", Key: "1", Tone: "bg-emerald-600 text-white" },
  { Value: "incorrect", Label: "Incorrect", Key: "2", Tone: "bg-red-600 text-white" },
  { Value: "unsure", Label: "Unsure", Key: "3", Tone: "bg-amber-500 text-white" },
];

/**
 * Verdict buttons, the reason picker (REQ-REV-007), and the note of one target. Stateless: the
 * review panel owns the drafts, so keys and clicks share one path.
 */
export function VerdictBar({
  kind,
  current,
  selected,
  saving,
  picker,
  note,
  onNote,
  onNoteBlur,
  onVerdict,
  onPicker,
  onSavePicker,
}: {
  kind: ReviewTargetKind;
  current: CurrentVerdict | null;
  selected: boolean;
  saving: boolean;
  picker: Picker | null;
  note: string;
  onNote: (note: string) => void;
  onNoteBlur: () => void;
  onVerdict: (verdict: ReviewVerdict) => void;
  onPicker: (picker: Picker | null) => void;
  onSavePicker: () => void;
}) {
  const toggle = (tag: ReviewTag) =>
    picker &&
    onPicker({
      ...picker,
      Tags: picker.Tags.includes(tag)
        ? picker.Tags.filter((t) => t !== tag)
        : [...picker.Tags, tag],
    });

  return (
    <div
      className={`mt-3 rounded-md border p-3 ${
        selected ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {VERDICTS.map((verdict) => {
          const active = (picker?.Verdict ?? current?.Verdict) === verdict.Value;
          return (
            <button
              key={verdict.Value}
              type="button"
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation();
                onVerdict(verdict.Value);
              }}
              aria-pressed={active}
              className={`min-h-9 rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
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
        {current && !picker && (
          <span className="text-xs text-slate-500">
            Saved {current.CreatedAt.slice(0, 16).replace("T", " ")}
            {current.Tags.length > 0 && ` · ${current.Tags.map(tagLabel).join(", ")}`}
            {(current.CorrectedSignals || current.CorrectedCandidate) && " · with correction"}
          </span>
        )}
      </div>

      {picker && (
        <div
          className="mt-3 rounded bg-slate-50 p-2 dark:bg-slate-950"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-xs text-slate-500">
            Why {picker.Verdict}? Pick any that apply, then <kbd>Enter</kbd> to save or{" "}
            <kbd>Esc</kbd> to cancel.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS[kind].map((option) => {
              const on = picker.Tags.includes(option.Tag);
              return (
                <button
                  key={option.Tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(option.Tag)}
                  className={`min-h-9 rounded border px-2 py-1 text-xs ${
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <kbd className="mr-1 opacity-70">{option.Key}</kbd>
                  {option.Label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onSavePicker}
              className="min-h-9 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Save
            </button>
            <button type="button" onClick={() => onPicker(null)} className="text-sm underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      <label className="mt-2 block text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
        Note ({note.length}/{NOTE_MAX}) — saved with the verdict, and kept in step when you edit it
        later
        <textarea
          className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onBlur={onNoteBlur}
        />
      </label>
    </div>
  );
}
