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

import { reconstructAbstract } from "./abstract.js";
import { type OpenAlexWork } from "./types.js";
import { normalizePdfLicense } from "../../normalize/license.js";

export type MappedOpenAlexWork = {
  Publication: Omit<Publication, "Id" | "CreatedAt" | "UpdatedAt">;
  SourceRecord: Omit<SourceRecord, "Id" | "PublicationId">;
  Authors: Array<Omit<Author, "Id"> & { SourceAuthorId: string }>;
  Authorships: Array<Omit<Authorship, "PublicationId" | "AuthorId"> & { SourceAuthorId: string }>;
  OpenAlexIds: string[];
};

function openAlexShortId(id: string): string {
  return id.replace(/^https:\/\/openalex\.org\//i, "");
}

function arxivFromWork(work: OpenAlexWork): string | null {
  const raw = work.ids?.arxiv;
  if (!raw) {
    return null;
  }
  return raw.replace(/^https?:\/\/arxiv\.org\/abs\//i, "");
}

export function mapOpenAlexWork(work: OpenAlexWork, fetchedAt: string): MappedOpenAlexWork {
  const title = (work.title ?? work.display_name ?? "").trim();
  const abstract = reconstructAbstract(work.abstract_inverted_index ?? null);
  const doi = work.doi ? normalizeDoi(work.doi) : work.ids?.doi ? normalizeDoi(work.ids.doi) : null;
  const arxivIdRaw = arxivFromWork(work);
  const arxivId = arxivIdRaw ? stripArxivVersion(arxivIdRaw) : null;
  const arxivVersion = arxivIdRaw ? parseArxivVersion(arxivIdRaw) : null;
  const sourceId = openAlexShortId(work.id);
  const missing = missingPublicationFields({
    Title: title,
    Abstract: abstract,
    PublicationDate: work.publication_date ?? null,
    Source: "openalex",
    SourceIdentifier: sourceId,
  });

  const topics = (work.topics ?? [])
    .flatMap((topic) => [
      topic.display_name,
      topic.field?.display_name,
      topic.subfield?.display_name,
    ])
    .filter((value): value is string => Boolean(value));

  const pdfLicense = normalizePdfLicense(work.primary_location?.license ?? null);
  const pdfUrl = work.primary_location?.pdf_url ?? work.open_access?.oa_url ?? null;

  const authors = (work.authorships ?? [])
    .map((authorship, index) => {
      const author = authorship.author;
      if (!author?.id || !author.display_name) {
        return null;
      }
      return {
        SourceAuthorId: openAlexShortId(author.id),
        DisplayName: author.display_name,
        Orcid: author.orcid ?? null,
        Position: index,
        Affiliations: (authorship.institutions ?? [])
          .map((institution) => institution.display_name)
          .filter((value): value is string => Boolean(value)),
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const openAlexIds = [sourceId];
  if (work.ids?.openalex) {
    openAlexIds.push(openAlexShortId(work.ids.openalex));
  }

  return {
    Publication: {
      Title: title || "Untitled",
      Abstract: abstract,
      PublicationDate: work.publication_date ?? null,
      Doi: doi,
      ArxivId: arxivId,
      ArxivVersion: arxivVersion,
      Topics: [...new Set(topics)],
      CitationCount: work.cited_by_count ?? 0,
      Completeness: missing.length === 0 ? "complete" : "incomplete",
      MissingFields: missing,
      RetractionFlag: Boolean(work.is_retracted),
      Language: work.language ?? null,
      HasStorablePdf: Boolean(pdfUrl && pdfLicense),
    },
    SourceRecord: {
      Source: "openalex",
      SourceId: sourceId,
      FetchedAt: fetchedAt,
      MetadataLicense: "cc0",
      OpenAccessUrl: work.open_access?.oa_url ?? null,
      PdfUrl: pdfUrl,
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
    OpenAlexIds: [...new Set(openAlexIds.map((id) => id.toLowerCase()))],
  };
}
