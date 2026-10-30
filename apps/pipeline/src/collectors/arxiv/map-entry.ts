import {
  missingPublicationFields,
  normalizeDoi,
  parseArxivVersion,
  stripArxivVersion,
  type Author,
  type Authorship,
  type Publication,
  type SourceRecord,
} from "@roi/models";

import { type ArxivEntry } from "./types.js";
import { normalizePdfLicense } from "../../normalize/license.js";

export type MappedArxivEntry = {
  Publication: Omit<Publication, "Id" | "CreatedAt" | "UpdatedAt">;
  SourceRecord: Omit<SourceRecord, "Id" | "PublicationId">;
  Authors: Array<Omit<Author, "Id"> & { SourceAuthorId: string }>;
  Authorships: Array<Omit<Authorship, "PublicationId" | "AuthorId"> & { SourceAuthorId: string }>;
};

function parseArxivId(id: string): string {
  return id.replace(/^https?:\/\/arxiv\.org\/abs\//i, "").trim();
}

function toIsoDate(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

export function mapArxivEntry(entry: ArxivEntry, fetchedAt: string): MappedArxivEntry {
  const arxivIdRaw = parseArxivId(entry.id);
  const arxivId = stripArxivVersion(arxivIdRaw);
  const arxivVersion = parseArxivVersion(arxivIdRaw);
  const abstract = entry.summary.trim() || null;
  const title = entry.title.replace(/\s+/g, " ").trim();
  const doi = entry.doi ? normalizeDoi(entry.doi) : null;
  const missing = missingPublicationFields({
    Title: title,
    Abstract: abstract,
    PublicationDate: toIsoDate(entry.published),
    Source: "arxiv",
    SourceIdentifier: arxivIdRaw,
  });
  const pdfLicense = normalizePdfLicense(entry.license ?? null);

  const authors = entry.authors.map((author, index) => ({
    SourceAuthorId: `arxiv-author:${arxivId}:${index}`,
    DisplayName: author.name.trim(),
    Orcid: null as string | null,
    Position: index,
    Affiliations: author.affiliation ? [author.affiliation] : [],
  }));

  return {
    Publication: {
      Title: title || "Untitled",
      Abstract: abstract,
      PublicationDate: toIsoDate(entry.published),
      Doi: doi,
      ArxivId: arxivId,
      ArxivVersion: arxivVersion,
      Topics: [...new Set([entry.primaryCategory, ...entry.categories])],
      CitationCount: 0,
      Completeness: missing.length === 0 ? "complete" : "incomplete",
      MissingFields: missing,
      RetractionFlag: Boolean(entry.withdrawn),
      Language: "en",
      HasStorablePdf: Boolean(entry.pdfUrl && pdfLicense),
    },
    SourceRecord: {
      Source: "arxiv",
      SourceId: arxivIdRaw,
      FetchedAt: fetchedAt,
      MetadataLicense: "cc0",
      OpenAccessUrl: `https://arxiv.org/abs/${arxivIdRaw}`,
      PdfUrl: entry.pdfUrl ?? `https://arxiv.org/pdf/${arxivId}`,
      PdfLicense: pdfLicense,
    },
    Authors: authors.map(({ SourceAuthorId, DisplayName, Orcid }) => ({
      SourceAuthorId,
      DisplayName,
      Orcid,
    })),
    Authorships: authors.map(({ SourceAuthorId, Position, Affiliations }) => ({
      SourceAuthorId,
      Position,
      Affiliations,
    })),
  };
}
