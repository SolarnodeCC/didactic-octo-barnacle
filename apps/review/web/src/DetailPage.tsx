import type { CurrentVerdict, ReviewDetailResponse, ReviewVerdict } from "@roi/models";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { getPublication } from "./api.js";
import { Link, navigate } from "./router.js";
import { arxivUrl, doiUrl, percent, segmentAbstract } from "./text.js";
import { ErrorNotice, ExternalLink, Field } from "./ui.js";
import { VERDICTS, VerdictControl, type VerdictTarget } from "./VerdictControl.js";

const SIGNALS = [
  ["NamedParty", "Named party"],
  ["StatedHarm", "Stated harm"],
  ["Trigger", "Trigger"],
  ["ExistingAlternative", "Existing alternative"],
  ["Adoptable", "Adoptable"],
] as const;

const COLORS = [
  "bg-yellow-200 dark:bg-yellow-800",
  "bg-sky-200 dark:bg-sky-800",
  "bg-pink-200 dark:bg-pink-800",
];

function typing(event: KeyboardEvent): boolean {
  const element = event.target as HTMLElement | null;
  return element !== null && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

/**
 * One publication with its triage decision and candidates (REQ-REV-002), with verdicts per
 * target (REQ-REV-003). Keys: j/k select a target, 1/2/3 record a verdict, n/p next or previous.
 */
export function DetailPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<ReviewDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const saves = useRef<((verdict: ReviewVerdict) => void)[]>([]);

  useEffect(() => {
    let cancelled = false;
    getPublication(id)
      .then((body) => !cancelled && setDetail(body))
      .catch((e: unknown) => !cancelled && setError(String((e as Error).message)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const targets: VerdictTarget[] = detail
    ? [
        { Kind: "triage", Id: detail.Triage.Id, Current: detail.Triage.Current },
        ...detail.Candidates.map((c) => ({
          Kind: "candidate" as const,
          Id: c.Id,
          Current: c.Current,
        })),
      ]
    : [];

  const saved = useCallback((targetId: string, verdict: CurrentVerdict) => {
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event) || event.metaKey || event.ctrlKey || event.altKey || !detail) return;
      const count = 1 + detail.Candidates.length;
      const verdict = VERDICTS.find((v) => v.Key === event.key);
      if (event.key === "j") setSelected((s) => Math.min(count - 1, s + 1));
      else if (event.key === "k") setSelected((s) => Math.max(0, s - 1));
      else if (event.key === "n" && detail.NextId)
        navigate(`/p/${encodeURIComponent(detail.NextId)}`);
      else if (event.key === "p" && detail.PreviousId)
        navigate(`/p/${encodeURIComponent(detail.PreviousId)}`);
      else if (verdict) saves.current[selected]?.(verdict.Value);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, selected]);

  if (error) return <ErrorNotice message={error} />;
  if (!detail) return <p className="text-sm text-slate-500">Loading…</p>;

  const { Publication, Triage, Extraction, Candidates, Highlights } = detail;
  const colorOf = new Map(Candidates.map((c, i) => [c.Id, COLORS[i % COLORS.length] as string]));
  const card =
    "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center justify-between gap-2 text-sm lg:col-span-2">
        <Link href="/" className="text-slate-500 hover:underline">
          ← All publications
        </Link>
        <span className="hidden text-xs text-slate-500 sm:inline">
          <kbd>j</kbd>/<kbd>k</kbd> select · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> verdict ·{" "}
          <kbd>n</kbd>/<kbd>p</kbd> next/previous
        </span>
        <span className="flex gap-3">
          {detail.PreviousId && (
            <Link href={`/p/${encodeURIComponent(detail.PreviousId)}`}>← Previous</Link>
          )}
          {detail.NextId && <Link href={`/p/${encodeURIComponent(detail.NextId)}`}>Next →</Link>}
        </span>
      </div>

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
          {Triage.Signals && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {SIGNALS.map(([key, label]) => (
                <li
                  key={key}
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    Triage.Signals?.[key]
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-slate-100 text-slate-500 line-through dark:bg-slate-800"
                  }`}
                >
                  {label}
                </li>
              ))}
            </ul>
          )}
          {Triage.Notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {Triage.Notes}
            </p>
          )}
          <VerdictControl
            target={targets[0] as VerdictTarget}
            selected={selected === 0}
            onSaved={(v) => saved(Triage.Id, v)}
            registerSave={(save) => (saves.current[0] = save)}
          />
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
          <section key={candidate.Id} className={card} onClick={() => setSelected(index + 1)}>
            <h3 className="flex items-center gap-2 font-semibold">
              <span
                className={`inline-block h-3 w-3 rounded-sm ${colorOf.get(candidate.Id) ?? ""}`}
                aria-hidden="true"
              />
              Candidate {index + 1}
            </h3>
            <dl className="mt-3 grid gap-3">
              <Field label="Finding">{candidate.Finding}</Field>
              <Field label="Evidence quote">“{candidate.EvidenceQuote}”</Field>
              <Field label="Customer">{candidate.Customer}</Field>
              <Field label="Customer quote">“{candidate.CustomerQuote}”</Field>
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
            </dl>
            <VerdictControl
              target={targets[index + 1] as VerdictTarget}
              selected={selected === index + 1}
              onSaved={(v) => saved(candidate.Id, v)}
              registerSave={(save) => (saves.current[index + 1] = save)}
            />
          </section>
        ))}
      </div>
    </article>
  );
}
