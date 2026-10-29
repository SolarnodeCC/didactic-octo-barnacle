import { normalizeDoi, stripArxivVersion } from "./common.js";

export type DedupeIdentifiers = {
  Doi?: string | null;
  ArxivId?: string | null;
  OpenAlexIds?: string[] | null;
};

export type DedupeMatch =
  | { Kind: "doi"; Value: string }
  | { Kind: "arxiv"; Value: string }
  | { Kind: "openalex"; Value: string }
  | { Kind: "title-author-review"; Value: string }
  | { Kind: "none" };

/**
 * Match publications in DOI, then arXiv ID, then OpenAlex ID order (REQ-DATA-007).
 * Title-and-first-author matches are flagged for review and never auto-merged.
 */
export function matchPublicationIdentifiers(
  incoming: DedupeIdentifiers,
  existing: DedupeIdentifiers,
): DedupeMatch {
  if (incoming.Doi && existing.Doi) {
    const left = normalizeDoi(incoming.Doi);
    const right = normalizeDoi(existing.Doi);
    if (left === right) {
      return { Kind: "doi", Value: left };
    }
  }

  if (incoming.ArxivId && existing.ArxivId) {
    const left = stripArxivVersion(incoming.ArxivId.toLowerCase());
    const right = stripArxivVersion(existing.ArxivId.toLowerCase());
    if (left === right) {
      return { Kind: "arxiv", Value: left };
    }
  }

  const incomingIds = new Set((incoming.OpenAlexIds ?? []).map((id) => id.toLowerCase()));
  for (const id of existing.OpenAlexIds ?? []) {
    if (incomingIds.has(id.toLowerCase())) {
      return { Kind: "openalex", Value: id.toLowerCase() };
    }
  }

  return { Kind: "none" };
}

export function titleAuthorReviewKey(title: string, firstAuthor: string): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${normalize(title)}|${normalize(firstAuthor)}`;
}
