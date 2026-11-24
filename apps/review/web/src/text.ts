import type { AbstractHighlight } from "@roi/models";

/**
 * Pure helpers of the review pages. Source and model text is only ever split into strings that
 * React renders as text nodes; nothing here produces markup (REQ-NFR-013, ADR 0016).
 */

/**
 * Limits of REQ-REV-003 AC1, repeated here because the browser bundle imports only types from
 * `@roi/models` (a value import would bundle Zod). A unit test keeps them equal.
 */
export const NOTE_MAX = 500;
export const CORRECTED_MAX = 2000;

export type Segment = { Text: string; CandidateIds: string[] };

/** The abstract cut at every highlight boundary; overlapping quotes share a segment. */
export function segmentAbstract(abstract: string, highlights: AbstractHighlight[]): Segment[] {
  const cuts = new Set<number>([0, abstract.length]);
  for (const highlight of highlights) {
    cuts.add(Math.max(0, Math.min(abstract.length, highlight.Start)));
    cuts.add(Math.max(0, Math.min(abstract.length, highlight.End)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i] as number;
    const end = points[i + 1] as number;
    if (start === end) continue;
    const ids = highlights
      .filter((h) => h.Start <= start && h.End >= end)
      .map((h) => h.CandidateId);
    segments.push({ Text: abstract.slice(start, end), CandidateIds: [...new Set(ids)] });
  }
  return segments;
}

/** The URL when it is `https`, else null, so only `https` targets become links (REQ-NFR-013). */
export function httpsOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function doiUrl(doi: string | null): string | null {
  return doi ? httpsOnly(`https://doi.org/${encodeURI(doi)}`) : null;
}

export function arxivUrl(arxivId: string | null): string | null {
  return arxivId ? httpsOnly(`https://arxiv.org/abs/${encodeURIComponent(arxivId)}`) : null;
}

export function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}
