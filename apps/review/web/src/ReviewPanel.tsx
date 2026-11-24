import type {
  CandidateCorrection,
  CurrentVerdict,
  ReviewCandidate,
  ReviewDetailResponse,
  ReviewTag,
  ReviewTargetKind,
  ReviewVerdict,
  TriageSignals,
} from "@roi/models";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { getPublication, recordVerdict, undoVerdict } from "./api.js";
import { navigate } from "./router.js";
import { SIGNAL_LABELS, TAG_OPTIONS, triageOutcome } from "./review-rules.js";
import { arxivUrl, doiUrl, percent, segmentAbstract } from "./text.js";
import { ErrorNotice, ExternalLink, Field } from "./ui.js";
import { VerdictBar, type Picker } from "./VerdictControl.js";

/**
 * One publication with its triage decision and candidates, and the verdict flow of REQ-REV-003,
 * REQ-REV-007, and REQ-REV-008. All drafts live here, so the keyboard and the buttons do the same.
 */

type Target = { Kind: ReviewTargetKind; Id: string; Current: CurrentVerdict | null };
type CandidateFields = {
  Finding: string;
  Customer: string;
  EvidenceQuote: string;
  CustomerQuote: string;
};
type Draft = { Note: string; Signals: TriageSignals | null; Fields: CandidateFields | null };

const COLORS = [
  "bg-yellow-200 dark:bg-yellow-800",
  "bg-sky-200 dark:bg-sky-800",
  "bg-pink-200 dark:bg-pink-800",
];

const FIELD_NAMES = ["Finding", "Customer", "EvidenceQuote", "CustomerQuote"] as const;

function fieldsOf(candidate: ReviewCandidate): CandidateFields {
  return {
    Finding: candidate.Finding,
    Customer: candidate.Customer,
    EvidenceQuote: candidate.EvidenceQuote,
    CustomerQuote: candidate.CustomerQuote,
  };
}

/** The candidate's fields with a saved correction applied over them. */
function withCorrection(
  fields: CandidateFields,
  correction: CandidateCorrection | null,
): CandidateFields {
  const result = { ...fields };
  for (const name of FIELD_NAMES) {
    const value = correction?.[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function typing(event: KeyboardEvent): boolean {
  const element = event.target as HTMLElement | null;
  return element !== null && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function sameSignals(a: TriageSignals, b: TriageSignals): boolean {
  return SIGNAL_LABELS.every(([key]) => a[key] === b[key]);
}

export type PanelNavigation = {
  PreviousLabel?: string;
  NextLabel?: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
};

export function ReviewPanel({
  id,
  navigation,
  header,
  onProgress,
  onComplete,
}: {
  id: string;
  /** Defaults to the neighbours in the list order. */
  navigation?: PanelNavigation;
  header?: ReactNode;
  /** Called after every saved or undone verdict, so a queue can refresh its counts. */
  onProgress?: () => void;
  /** Called once every target of the publication has a verdict (REQ-REV-006 auto-advance). */
  onComplete?: () => void;
}) {
  const [detail, setDetail] = useState<ReviewDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const undoStack = useRef<Target[]>([]);
  const go = (target: string | null | undefined) =>
    target ? () => navigate(`/p/${encodeURIComponent(target)}`) : null;
  const nav: PanelNavigation = navigation ?? {
    onPrevious: go(detail?.PreviousId),
    onNext: go(detail?.NextId),
  };

  useEffect(() => {
    let cancelled = false;
    getPublication(id)
      .then((body) => {
        if (cancelled) return;
        setDetail(body);
        const initial: Record<string, Draft> = {
          [body.Triage.Id]: {
            Note: body.Triage.Current?.Note ?? "",
            Signals: body.Triage.Current?.CorrectedSignals ?? body.Triage.Signals,
            Fields: null,
          },
        };
        for (const candidate of body.Candidates) {
          initial[candidate.Id] = {
            Note: candidate.Current?.Note ?? "",
            Signals: null,
            Fields: withCorrection(
              fieldsOf(candidate),
              candidate.Current?.CorrectedCandidate ?? null,
            ),
          };
        }
        setDrafts(initial);
        const targets = [body.Triage, ...body.Candidates];
        const firstOpen = targets.findIndex((t) => t.Current === null);
        setSelected(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((e: unknown) => !cancelled && setError(String((e as Error).message)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const targets: Target[] = detail
    ? [
        { Kind: "triage", Id: detail.Triage.Id, Current: detail.Triage.Current },
        ...detail.Candidates.map((c) => ({
          Kind: "candidate" as const,
          Id: c.Id,
          Current: c.Current,
        })),
      ]
    : [];

  const applyCurrent = useCallback((targetId: string, verdict: CurrentVerdict | null) => {
    setDetail((current) => {
      if (!current) return current;
      if (current.Triage.Id === targetId) {
        return { ...current, Triage: { ...current.Triage, Current: verdict } };
      }
      return {
        ...current,
        Candidates: current.Candidates.map((c) =>
          c.Id === targetId ? { ...c, Current: verdict } : c,
        ),
      };
    });
  }, []);

  /** Saves a verdict with the target's draft; `advance` moves on like a fresh verdict does. */
  const save = useCallback(
    async (index: number, verdict: ReviewVerdict, tags: ReviewTag[], advance: boolean) => {
      if (!detail) return;
      const target = targets[index];
      if (!target) return;
      const draft = drafts[target.Id];
      let correctedSignals: TriageSignals | null = null;
      let correctedCandidate: CandidateCorrection | null = null;
      if (target.Kind === "triage" && draft?.Signals && detail.Triage.Signals) {
        correctedSignals = sameSignals(draft.Signals, detail.Triage.Signals) ? null : draft.Signals;
      }
      if (target.Kind === "candidate" && draft?.Fields) {
        const original = detail.Candidates.find((c) => c.Id === target.Id);
        const changed = FIELD_NAMES.filter(
          (name) => original && draft.Fields && draft.Fields[name].trim() !== original[name],
        );
        if (changed.length) {
          correctedCandidate = Object.fromEntries(
            changed.map((name) => [name, (draft.Fields as CandidateFields)[name].trim()]),
          ) as CandidateCorrection;
        }
      }
      setSaving(true);
      setError(null);
      try {
        const stored = await recordVerdict({
          TargetKind: target.Kind,
          TargetId: target.Id,
          Verdict: verdict,
          Note: draft?.Note ?? "",
          Tags: verdict === "correct" ? [] : tags,
          CorrectedSignals: correctedSignals,
          CorrectedCandidate: correctedCandidate,
        });
        applyCurrent(target.Id, stored);
        undoStack.current.push(target);
        setPicker(null);
        onProgress?.();
        if (advance) {
          const after = targets.map((t, i) => (i === index ? { ...t, Current: stored } : t));
          const next = after.findIndex((t, i) => i > index && t.Current === null);
          const anyOpen = after.findIndex((t) => t.Current === null);
          if (anyOpen === -1) onComplete?.();
          else setSelected(next === -1 ? anyOpen : next);
        }
      } catch (e) {
        setError(String((e as Error).message));
      } finally {
        setSaving(false);
      }
    },
    [detail, drafts, applyCurrent, onComplete, onProgress],
  );

  const undo = useCallback(async () => {
    const target = undoStack.current.pop();
    if (!target) return;
    try {
      const result = await undoVerdict(target.Kind, target.Id);
      applyCurrent(target.Id, result.Current);
      setSelected(targets.findIndex((t) => t.Id === target.Id));
      onProgress?.();
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [detail, applyCurrent, onProgress]);

  const allCorrect = useCallback(async () => {
    for (const [index, target] of targets.entries()) {
      if (target.Current === null) await save(index, "correct", [], false);
    }
    onComplete?.();
  }, [detail, save, onComplete]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event) || event.metaKey || event.ctrlKey || event.altKey || !detail || saving)
        return;
      if (picker) {
        const kind = targets[picker.Index]?.Kind ?? "triage";
        const option = TAG_OPTIONS[kind].find((o) => o.Key === event.key);
        if (option) {
          setPicker({
            ...picker,
            Tags: picker.Tags.includes(option.Tag)
              ? picker.Tags.filter((t) => t !== option.Tag)
              : [...picker.Tags, option.Tag],
          });
        } else if (event.key === "Enter")
          void save(picker.Index, picker.Verdict, picker.Tags, true);
        else if (event.key === "Escape") setPicker(null);
        else return;
        event.preventDefault();
        return;
      }
      const count = targets.length;
      if (event.key === "j") setSelected((s) => Math.min(count - 1, s + 1));
      else if (event.key === "k") setSelected((s) => Math.max(0, s - 1));
      else if (event.key === "n" && nav.onNext) nav.onNext();
      else if (event.key === "p" && nav.onPrevious) nav.onPrevious();
      else if (event.key === "1") void save(selected, "correct", [], true);
      else if (event.key === "2" || event.key === "3") {
        const verdict = event.key === "2" ? "incorrect" : "unsure";
        const current = targets[selected]?.Current;
        setPicker({
          Index: selected,
          Verdict: verdict,
          Tags: current?.Verdict === verdict ? current.Tags : [],
        });
      } else if (event.key === "a") void allCorrect();
      else if (event.key === "u") void undo();
      else if (event.key === "?") setHelp((h) => !h);
      else if (event.key === "Escape") setHelp(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, selected, picker, saving, save, undo, allCorrect, nav]);

  if (error && !detail) return <ErrorNotice message={error} />;
  if (!detail) return <p className="text-sm text-slate-500">Loading…</p>;

  const { Publication, Triage, Extraction, Candidates, Highlights } = detail;
  const colorOf = new Map(Candidates.map((c, i) => [c.Id, COLORS[i % COLORS.length] as string]));
  const card =
    "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  const setDraft = (targetId: string, change: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [targetId]: { ...(all[targetId] as Draft), ...change } }));
  /** Keeps a saved verdict in step with an edited note or correction (autosave). */
  const resave = (index: number) => {
    const current = targets[index]?.Current;
    if (current) void save(index, current.Verdict, current.Tags, false);
  };
  const bar = (index: number) => {
    const target = targets[index] as Target;
    return (
      <VerdictBar
        kind={target.Kind}
        current={target.Current}
        selected={selected === index}
        saving={saving}
        picker={picker?.Index === index ? picker : null}
        note={drafts[target.Id]?.Note ?? ""}
        onNote={(note) => setDraft(target.Id, { Note: note })}
        onNoteBlur={() => resave(index)}
        onVerdict={(verdict) =>
          verdict === "correct"
            ? void save(index, "correct", [], true)
            : setPicker({
                Index: index,
                Verdict: verdict,
                Tags: target.Current?.Verdict === verdict ? target.Current.Tags : [],
              })
        }
        onPicker={setPicker}
        onSavePicker={() => picker && void save(picker.Index, picker.Verdict, picker.Tags, true)}
      />
    );
  };

  const triageDraft = drafts[Triage.Id]?.Signals ?? null;
  const modelOutcome = Triage.Signals ? triageOutcome(Triage.Signals) : null;
  const draftOutcome = triageDraft ? triageOutcome(triageDraft) : null;
  const signalsChanged = Boolean(
    Triage.Signals && triageDraft && !sameSignals(Triage.Signals, triageDraft),
  );

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
        <div className="min-w-0 sm:flex-1">{header}</div>
        <span className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="hidden text-xs text-slate-500 underline sm:inline"
            onClick={() => setHelp(true)}
          >
            Shortcuts <kbd>?</kbd>
          </button>
          {nav.onPrevious && (
            <button type="button" className="hover:underline" onClick={nav.onPrevious}>
              ← {nav.PreviousLabel ?? "Previous"}
            </button>
          )}
          {nav.onNext && (
            <button type="button" className="hover:underline" onClick={nav.onNext}>
              {nav.NextLabel ?? "Next"} →
            </button>
          )}
        </span>
      </div>
      {error && (
        <div className="lg:col-span-2">
          <ErrorNotice message={error} />
        </div>
      )}

      <section
        className={`${card} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto`}
      >
        <h2 className="text-lg font-semibold">{Publication.Title}</h2>
        <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{Publication.PublishedAt ?? "no date"}</span>
          <ExternalLink href={doiUrl(Publication.Doi)}>DOI {Publication.Doi}</ExternalLink>
          <ExternalLink href={arxivUrl(Publication.ArxivId)}>
            arXiv {Publication.ArxivId}
          </ExternalLink>
        </p>
        <h3 className="mt-4 text-xs uppercase tracking-wide text-slate-500">Abstract</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
          {Publication.Abstract
            ? segmentAbstract(Publication.Abstract, Highlights).map((segment, i) =>
                segment.CandidateIds.length ? (
                  <mark
                    key={i}
                    className={`rounded-sm text-inherit ${colorOf.get(segment.CandidateIds[0] as string) ?? ""}`}
                  >
                    {segment.Text}
                  </mark>
                ) : (
                  <Fragment key={i}>{segment.Text}</Fragment>
                ),
              )
            : "No abstract stored."}
        </p>
        {Extraction?.InputMode === "full-text" && (
          <p className="mt-2 text-xs text-slate-500">
            Extraction read the full text; quotes outside the abstract are not highlighted.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-6">
        <section className={card} onClick={() => setSelected(0)}>
          <h3 className="font-semibold">
            Triage:{" "}
            <span
              className={
                Triage.Accepted
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-slate-600 dark:text-slate-300"
              }
            >
              {Triage.Accepted ? "accepted" : "rejected"}
            </span>
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Reason">{Triage.Reason ?? "waiting for admission"}</Field>
            <Field label="Score">{percent(Triage.Score)}</Field>
            <Field label="Model">{Triage.Model ?? "rule"}</Field>
            <Field label="Prompt version">{Triage.PromptVersion ?? "–"}</Field>
          </dl>
          {Triage.Signals && triageDraft && (
            <div className="mt-3">
              <p className="text-xs text-slate-500">
                Signals: click one to correct how the model read it.
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {SIGNAL_LABELS.map(([key, label]) => {
                  const on = triageDraft[key];
                  const changed = on !== Triage.Signals?.[key];
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDraft(Triage.Id, { Signals: { ...triageDraft, [key]: !on } });
                        }}
                        onBlur={() => resave(0)}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          on
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                            : "bg-slate-100 text-slate-500 line-through dark:bg-slate-800"
                        } ${changed ? "ring-2 ring-amber-500" : ""}`}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Rule: named party and stated harm, and at least 3 of 5 signals (cut 0.55). Model
                reading: {percent(modelOutcome?.Score ?? null)} →{" "}
                {modelOutcome?.Accepted ? "accept" : "reject"}
                {signalsChanged && draftOutcome && (
                  <strong className="text-amber-700 dark:text-amber-400">
                    {" "}
                    · Your reading: {percent(draftOutcome.Score)} →{" "}
                    {draftOutcome.Accepted ? "accept" : "reject"}
                  </strong>
                )}
              </p>
            </div>
          )}
          {Triage.Notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {Triage.Notes}
            </p>
          )}
          {bar(0)}
        </section>

        <section className={card}>
          <h3 className="font-semibold">Extraction</h3>
          {Extraction ? (
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Input">{Extraction.InputMode}</Field>
              <Field label="Confidence">{percent(Extraction.Confidence)}</Field>
              <Field label="Model">{Extraction.Model}</Field>
              <Field label="Prompt version">{Extraction.PromptVersion}</Field>
              {Extraction.Notes && <Field label="Notes">{Extraction.Notes}</Field>}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No extraction for this publication.</p>
          )}
        </section>

        {Candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.Id}
            candidate={candidate}
            number={index + 1}
            color={colorOf.get(candidate.Id) ?? ""}
            card={card}
            fields={drafts[candidate.Id]?.Fields ?? fieldsOf(candidate)}
            onSelect={() => setSelected(index + 1)}
            onField={(name, value) =>
              setDraft(candidate.Id, {
                Fields: { ...(drafts[candidate.Id]?.Fields ?? fieldsOf(candidate)), [name]: value },
              })
            }
            onFieldBlur={() => resave(index + 1)}
          >
            {bar(index + 1)}
          </CandidateCard>
        ))}
      </div>

      {help && <ShortcutSheet onClose={() => setHelp(false)} />}
    </article>
  );
}

function CandidateCard({
  candidate,
  number,
  color,
  card,
  fields,
  onSelect,
  onField,
  onFieldBlur,
  children,
}: {
  candidate: ReviewCandidate;
  number: number;
  color: string;
  card: string;
  fields: CandidateFields;
  onSelect: () => void;
  onField: (name: keyof CandidateFields, value: string) => void;
  onFieldBlur: () => void;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const input =
    "mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950";
  const edited = (name: keyof CandidateFields) => fields[name].trim() !== candidate[name];
  const editable = (name: keyof CandidateFields, label: string, quoted = false) =>
    editing ? (
      <label className="block text-xs uppercase tracking-wide text-slate-500">
        {label}
        {edited(name) && <span className="ml-1 normal-case text-amber-600">changed</span>}
        <textarea
          className={input}
          rows={name === "Finding" ? 2 : 1}
          value={fields[name]}
          onChange={(e) => onField(name, e.target.value)}
          onBlur={onFieldBlur}
        />
      </label>
    ) : (
      <Field label={edited(name) ? `${label} (corrected)` : label}>
        {quoted ? `“${fields[name]}”` : fields[name]}
      </Field>
    );

  return (
    <section className={card} onClick={onSelect}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className={`inline-block h-3 w-3 rounded-sm ${color}`} aria-hidden="true" />
        Candidate {number}
        <button
          type="button"
          className="ml-auto text-xs font-normal text-slate-500 underline"
          onClick={(event) => {
            event.stopPropagation();
            setEditing((e) => !e);
          }}
        >
          {editing ? "Done editing" : "Correct fields"}
        </button>
      </h3>
      <div className="mt-3 grid gap-3">
        {editable("Finding", "Finding")}
        {editable("EvidenceQuote", "Evidence quote", true)}
        {editable("Customer", "Customer")}
        {editable("CustomerQuote", "Customer quote", true)}
        {candidate.WhyNow && (
          <Field label="Why now">
            {candidate.WhyNow} — “{candidate.WhyNowQuote}”
          </Field>
        )}
        {candidate.CurrentAlternative && (
          <Field label="Current alternative">
            {candidate.CurrentAlternative} — “{candidate.AlternativeQuote}”
          </Field>
        )}
      </div>
      {children}
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ["j / k", "Select the next or previous item (triage, then each candidate)"],
  ["1", "Correct — saves and moves on"],
  ["2 / 3", "Incorrect / Unsure — opens the reasons; toggle with their letter, Enter saves"],
  ["a", "Mark every item without a verdict correct"],
  ["u", "Undo your last verdict"],
  ["n / p", "Next or previous publication"],
  ["Esc", "Close the reasons or this sheet"],
];

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 font-semibold">Keyboard shortcuts</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, text]) => (
            <Fragment key={keys}>
              <dt>
                <kbd className="rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-slate-600 dark:text-slate-300">{text}</dd>
            </Fragment>
          ))}
        </dl>
        <button type="button" className="mt-4 text-sm underline" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
